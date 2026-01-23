#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Retrieve the Perplexity API key from environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  process.exit(1);
}

/**
 * Makes a request to Perplexity API using curl
 */
function curlRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = `https://api.perplexity.ai/${endpoint}`;
    const curlArgs = [
      '-s',
      '-X', 'POST',
      url,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${PERPLEXITY_API_KEY}`,
      '-d', JSON.stringify(body)
    ];

    const curlProcess = spawn('curl', curlArgs);
    let stdout = '';
    let stderr = '';

    curlProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    curlProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    curlProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`curl failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse JSON: ${error.message}\nResponse: ${stdout}`));
      }
    });
  });
}

/**
 * Process MCP protocol messages
 */
async function processMessage(message) {
  let msg;
  let requestId = null;
  
  try {
    msg = JSON.parse(message);
    requestId = msg.id;
  } catch (parseError) {
    // If we can't parse the message at all, return a parse error
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: parseError.message
      }
    });
  }
  
  try {
    if (msg.method === 'initialize') {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true }
          },
          serverInfo: {
            name: 'perplexity-curl-server',
            version: '1.0.0'
          }
        }
      });
    }
    
    if (msg.method === 'tools/list') {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          tools: [
            {
              name: 'perplexity_ask',
              title: 'Ask Perplexity',
              description: 'Ask questions to Perplexity AI',
              inputSchema: {
                type: 'object',
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        role: { type: 'string' },
                        content: { type: 'string' }
                      },
                      required: ['role', 'content']
                    }
                  }
                },
                required: ['messages']
              }
            },
            {
              name: 'perplexity_search',
              title: 'Search Web',
              description: 'Search the web using Perplexity',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  max_results: { type: 'number', minimum: 1, maximum: 20 },
                  max_tokens_per_page: { type: 'number', minimum: 256, maximum: 2048 },
                  country: { type: 'string' }
                },
                required: ['query']
              }
            }
          ]
        }
      });
    }
    
    if (msg.method === 'notifications/initialized') {
      // MCP protocol requires accepting this notification silently
      // Return nothing (no response) for notifications
      return '';
    }
    
    if (msg.method === 'ping') {
      // Respond to ping requests
      return JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        result: {}
      });
    }
    
    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params;
      
      if (name === 'perplexity_ask') {
        const { messages } = args;
        
        // Validate messages
        if (!Array.isArray(messages)) {
          throw new Error('messages must be an array');
        }
        
        const body = {
          model: 'sonar-pro',
          messages: messages
        };
        
        const data = await curlRequest('chat/completions', body);
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('Invalid API response');
        }
        
        const content = data.choices[0].message.content;
        
        return JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          result: {
            content: [{ type: 'text', text: content }]
          }
        });
      }
      
      if (name === 'perplexity_search') {
        const { query, max_results = 10, max_tokens_per_page = 1024, country } = args;
        
        const body = {
          query: query,
          max_results: max_results,
          max_tokens_per_page: max_tokens_per_page
        };
        
        if (country) {
          body.country = country;
        }
        
        const data = await curlRequest('search', body);
        
        if (!data.results || !Array.isArray(data.results)) {
          throw new Error('No search results found');
        }
        
        let formattedResults = `Found ${data.results.length} search results:\n\n`;
        
        data.results.forEach((result, index) => {
          formattedResults += `${index + 1}. **${result.title}**\n`;
          formattedResults += `   URL: ${result.url}\n`;
          if (result.snippet) {
            formattedResults += `   ${result.snippet}\n`;
          }
          if (result.date) {
            formattedResults += `   Date: ${result.date}\n`;
          }
          formattedResults += `\n`;
        });
        
        return JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          result: {
            content: [{ type: 'text', text: formattedResults }]
          }
        });
      }
      
      throw new Error(`Unknown tool: ${name}`);
    }
    
    // Unknown method
    return JSON.stringify({
      jsonrpc: '2.0',
      id: requestId !== undefined ? requestId : null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
    
} catch (error) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: requestId !== undefined ? requestId : null,
    error: {
      code: -32603,
      message: error.message
    }
  });
}
}

// Main server loop
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  // Don't write startup message to stderr - MCP clients might read it
  // console.error('Perplexity Curl MCP Server started');

  rl.on('line', async (line) => {
    try {
      const response = await processMessage(line);
      if (response) {
        process.stdout.write(response + '\n');
      }
    } catch (error) {
      // Send error as JSON-RPC response instead of logging to stderr
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  rl.on('close', () => {
    // Don't write shutdown message
    // console.error('Server shutting down');
    process.exit(0);
  });
}

// Handle errors - don't write to stderr as MCP clients might read it
process.on('uncaughtException', (error) => {
  // Silently exit on uncaught exception
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  // Silently exit on unhandled rejection
  process.exit(1);
});

main().catch((error) => {
  // Silently exit on fatal error
  process.exit(1);
});
