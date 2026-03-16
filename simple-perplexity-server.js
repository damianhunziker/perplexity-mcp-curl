#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex !== -1) {
          const key = trimmed.substring(0, equalsIndex).trim();
          const value = trimmed.substring(equalsIndex + 1).trim();
          // Remove quotes if present
          const cleanValue = value.replace(/^['"]|['"]$/g, '');
          process.env[key] = cleanValue;
        }
      }
    }
  }
}

// Load .env file
loadEnvFile();

// Retrieve the Perplexity API key from environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  console.error("Please create a .env file with PERPLEXITY_API_KEY=your_key_here");
  process.exit(1);
}

/**
 * Makes a request to Perplexity API using curl
 */
function curlRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    // Handle v1/responses endpoint (no leading slash needed)
    // For /v1/responses, we need to include the v1/ prefix in the endpoint
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
            },
            {
              name: 'perplexity_research',
              title: 'Research with Perplexity',
              description: 'Perform deep research using Perplexity AI with web search capabilities',
              inputSchema: {
                type: 'object',
                properties: {
                  input: { type: 'string', description: 'The research question or topic' },
                  preset: {
                    type: 'string',
                    enum: ['fast-search', 'pro-search', 'deep-research'],
                    description: 'Preset configuration for research depth'
                  },
                  model: {
                    type: 'string',
                    description: 'Model ID in provider/model format (e.g., "openai/gpt-5.2")'
                  },
                  max_steps: {
                    type: 'number',
                    minimum: 1,
                    maximum: 10,
                    description: 'Maximum number of research loop steps (1-10)'
                  },
                  max_output_tokens: {
                    type: 'number',
                    minimum: 1,
                    description: 'Maximum tokens to generate'
                  },
                  instructions: {
                    type: 'string',
                    description: 'System instructions for the model'
                  },
                  tools: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: {
                          type: 'string',
                          enum: ['web_search', 'fetch_url']
                        }
                      },
                      required: ['type']
                    },
                    description: 'Tools available to the model (web_search, fetch_url)'
                  }
                },
                required: ['input']
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
      
      if (name === 'perplexity_research') {
        const { input, preset, model, max_steps, max_output_tokens, instructions, tools } = args;
        
        // Debug logging
        console.error(`DEBUG: perplexity_research called with preset=${preset}, forcing 'deep-research'`);
        
        if (!input || typeof input !== 'string') {
          throw new Error('input parameter is required and must be a string');
        }
        
        const body = {
          input: input,
          preset: 'deep-research'  // Always use deep-research
        };
        
        if (model) {
          body.model = model;
        }
        
        if (max_steps) {
          body.max_steps = max_steps;
        }
        
        if (max_output_tokens) {
          body.max_output_tokens = max_output_tokens;
        }
        
        if (instructions) {
          body.instructions = instructions;
        }
        
        if (tools) {
          body.tools = tools;
        }
        
        const data = await curlRequest('v1/responses', body);
        
        // Format the research response
        let formattedResponse = '';
        
        if (data.output && Array.isArray(data.output)) {
          // Extract text content from output
          data.output.forEach((outputItem) => {
            if (outputItem.type === 'message' && outputItem.content && Array.isArray(outputItem.content)) {
              outputItem.content.forEach((content) => {
                if (content.type === 'output_text' && content.text) {
                  formattedResponse += content.text + '\n\n';
                }
              });
            }
            
            // Include search results if available
            if (outputItem.type === 'search_results' && outputItem.results) {
              formattedResponse += 'Search Results:\n';
              outputItem.results.forEach((result, index) => {
                formattedResponse += `${index + 1}. **${result.title}**\n`;
                if (result.url) {
                  formattedResponse += `   URL: ${result.url}\n`;
                }
                if (result.snippet) {
                  formattedResponse += `   ${result.snippet}\n`;
                }
                formattedResponse += '\n';
              });
            }
            
            // Include fetch URL results if available
            if (outputItem.type === 'fetch_url_results' && outputItem.contents) {
              formattedResponse += 'Fetched URLs:\n';
              outputItem.contents.forEach((content, index) => {
                formattedResponse += `${index + 1}. **${content.title}**\n`;
                if (content.snippet) {
                  formattedResponse += `   ${content.snippet}\n`;
                }
                formattedResponse += '\n';
              });
            }
          });
        }
        
        // Add usage information if available
        if (data.usage) {
          formattedResponse += '---\n';
          formattedResponse += `Usage: ${data.usage.total_tokens} tokens\n`;
          if (data.usage.cost && data.usage.cost.total_cost !== undefined) {
            formattedResponse += `Cost: $${data.usage.cost.total_cost.toFixed(6)}\n`;
          }
        }
        
        if (!formattedResponse.trim()) {
          formattedResponse = 'No research results found';
        }
        
        return JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          result: {
            content: [{ type: 'text', text: formattedResponse }]
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
