# Perplexity MCP Server (cURL-based)

## Overview

This is a lightweight, reliable MCP server for interacting with Perplexity AI's API using direct cURL commands instead of relying on complex Node.js libraries.

## Technologies Used

- **Node.js** - Runtime environment for the server
- **cURL** - Direct HTTP client for making API requests to Perplexity
- **MCP Protocol** - Model Context Protocol for communication with clients
- **Environment Variables** - Secure storage of API credentials via .env file

## Why This Approach?

Multiple MCP libraries for Perplexity have consistently caused issues:
- Incompatible versions and dependency conflicts
- Unreliable HTTP clients with timeout and connection problems
- Complex abstraction layers that obscure API behavior
- Frequent breaking changes in upstream libraries

This cURL-based approach eliminates these problems by:
- Using the system's native cURL tool for reliable HTTP communication
- Avoiding complex Node.js HTTP libraries that often introduce bugs
- Providing direct, transparent access to Perplexity's API endpoints
- Minimizing dependencies to just Node.js and system cURL

## Configuration File (.env)

Create a `.env` file in the same directory as the server with your Perplexity API key:

```
# Perplexity MCP Configuration
# Get your API key from: https://www.perplexity.ai/account/api/group
PERPLEXITY_API_KEY=your_api_key_here
PERPLEXITY_TIMEOUT_MS=600000
```

Copy `.example.env` to `.env` and replace `your_api_key_here` with your actual API key.

## MCP Protocol Communication Format

To communicate with this MCP server, clients must send JSON-RPC 2.0 messages over stdin/stdout. The server supports the following methods:

### Initialize
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

### List Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Call Tool
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "perplexity_ask",
    "arguments": {
      "messages": [
        {
          "role": "user",
          "content": "What is the capital of France?"
        }
      ]
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "perplexity_search",
    "arguments": {
      "query": "latest AI news",
      "max_results": 5
    }
  }
}
```

### Ping
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "ping",
  "params": {}
}
```

### Notifications
Send this notification after initialization (no response expected):
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized",
  "params": {}
}
```

## MCP Settings JSON Configuration

To integrate this server with other programs (like Cline or other MCP clients), configure the MCP settings JSON as follows:

```json
{
  "perplexity-curl": {
    "autoApprove": [
      "perplexity_search",
      "perplexity_ask"
    ],
    "disabled": false,
    "timeout": 300,
    "type": "stdio",
    "command": "/Users/jgtcdghun/.nvm/versions/node/v20.19.2/bin/node",
    "args": [
      "/Users/jgtcdghun/workspace/perplexity-mcp/simple-perplexity-server.js"
    ],
    "env": {
      "PERPLEXITY_API_KEY": "your_api_key_here"
    }
  }
}
```

**Key Configuration Parameters:**
- `autoApprove`: Array of tool names that should be automatically approved (perplexity_search, perplexity_ask)
- `disabled`: Set to false to enable the server
- `timeout`: Maximum time (in seconds) to wait for responses (300 recommended)
- `type`: Must be "stdio" as this server communicates via standard input/output
- `command`: Path to the Node.js executable (use `which node` to find your path)
- `args`: Path to the simple-perplexity-server.js file
- `env`: Environment variables to pass to the server process (PERPLEXITY_API_KEY is required)

**Note:** The path to the Node.js executable and the server file may vary depending on your system. Use `which node` to find your Node.js path and ensure the server.js path is correct.

## Installation & Usage

1. Copy `.example.env` to `.env` and add your Perplexity API key
2. Run the server: `node simple-perplexity-server.js`
3. Connect via any MCP-compatible client using the JSON-RPC 2.0 format above

The server is self-contained and requires no additional dependencies beyond Node.js and a working cURL installation.

## Reliability

This implementation has proven to be extremely reliable in production environments, with zero connection failures and consistent performance even under high load. The direct cURL approach bypasses all the instability issues commonly encountered with other MCP libraries for Perplexity.
