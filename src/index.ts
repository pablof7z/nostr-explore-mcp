#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";
import { tools, getToolByName } from "./tools/index.js";
import { initializeSubscriptionManager } from "./tools/notifications.js";
import { FeedResource } from "./resources/feed.js";

const RELAYS = [
  "wss://relay.primal.net",
  "wss://tenex.chat"
];

const ndk = new NDK({
  explicitRelayUrls: RELAYS,
});

let subscriptionManager: ReturnType<typeof initializeSubscriptionManager> | null = null;
let feedResource: FeedResource | null = null;

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
      resources: {},
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

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!feedResource) {
    return { resources: [] };
  }
  
  const resources = await feedResource.list();
  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!feedResource) {
    throw new Error("Feed resource not initialized");
  }

  const { uri } = request.params;
  
  if (!uri.startsWith("nostr://feed/")) {
    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  try {
    const contents = await feedResource.get(uri);
    return {
      contents: [
        {
          uri,
          mimeType: "application/x-ndjson",
          text: contents,
        }
      ]
    };
  } catch (error) {
    throw new Error(`Failed to read resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
  }
});

async function main() {
  // Connect to Nostr
  await connectToNostr();
  
  // Initialize subscription manager
  subscriptionManager = initializeSubscriptionManager(ndk);
  
  // Initialize feed resource
  feedResource = new FeedResource(ndk);
  
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