#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";
import { tools, getToolByName } from "./tools/index.js";
import { initializeSubscriptionManager } from "./tools/notifications.js";

const RELAYS = [
  "wss://relay.primal.net",
  "wss://tenex.chat"
];

const ndk = new NDK({
  explicitRelayUrls: RELAYS,
});

let subscriptionManager: ReturnType<typeof initializeSubscriptionManager> | null = null;

async function connectToNostr() {
  await ndk.connect();
  console.error(`Connected to Nostr relays: ${RELAYS.join(", ")}`);
}

const server = new Server(
  {
    name: "nostr-explore-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => tool.schema),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = getToolByName(request.params.name);
  
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  try {
    return await tool.handler(request.params.arguments, ndk);
  } catch (error) {
    throw new Error(`Failed to execute ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
});

async function main() {
  // Connect to Nostr
  await connectToNostr();
  
  // Initialize subscription manager
  subscriptionManager = initializeSubscriptionManager(ndk);
  
  // Start the MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("Nostr Explore MCP server running");
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.error("Shutting down gracefully...");
  if (subscriptionManager) {
    subscriptionManager.stopAll();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error("Shutting down gracefully...");
  if (subscriptionManager) {
    subscriptionManager.stopAll();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});