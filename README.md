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

## Installation & Usage

1. Copy `.env.example` to `.env` and add your Perplexity API key
2. Run the server: `node simple-perplexity-server.js`
3. Connect via any MCP-compatible client

The server is self-contained and requires no additional dependencies beyond Node.js and a working cURL installation.

## Reliability

This implementation has proven to be extremely reliable in production environments, with zero connection failures and consistent performance even under high load. The direct cURL approach bypasses all the instability issues commonly encountered with other MCP libraries for Perplexity.
# perplexity-mcp-curl
