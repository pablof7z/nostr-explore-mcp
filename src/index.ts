#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";
import { z } from "zod";
import { tools, getToolByName } from "./tools/index.js";
import { initializeSubscriptionManager } from "./tools/notifications.js";
import { createFeedResourceTemplate } from "./resources/feed.js";

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

// Helper function to convert JSON Schema to Zod schema
function jsonSchemaToZod(jsonSchema: any): any {
  if (!jsonSchema) return z.object({});
  
  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    const shape: Record<string, any> = {};
    
    for (const [key, prop] of Object.entries(jsonSchema.properties as any)) {
      let zodType: any;
      
      if (prop.type === 'string') {
        zodType = z.string();
      } else if (prop.type === 'number') {
        zodType = z.number();
      } else if (prop.type === 'boolean') {
        zodType = z.boolean();
      } else if (prop.type === 'array') {
        zodType = z.array(z.any());
      } else if (prop.type === 'object') {
        zodType = z.object({});
      } else {
        zodType = z.any();
      }
      
      // Add description if present
      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }
      
      // Make optional if not in required array
      if (!jsonSchema.required || !jsonSchema.required.includes(key)) {
        zodType = zodType.optional();
      }
      
      shape[key] = zodType;
    }
    
    return shape;
  }
  
  return {};
}

// Create the MCP server using McpServer instead of Server
const mcpServer = new McpServer({
  name: "nostr-explore-mcp",
  version: "0.1.0"
});

// Register all existing tools
tools.forEach(tool => {
  // Convert JSON schema to Zod schema
  const zodSchema = jsonSchemaToZod(tool.schema.inputSchema);
  
  mcpServer.registerTool(
    tool.schema.name,
    {
      description: tool.schema.description || "",
      inputSchema: zodSchema
    },
    async (args) => {
      try {
        return await tool.handler(args, ndk);
      } catch (error) {
        throw new Error(`Failed to execute ${tool.schema.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
});

// Register the feed resource template
const { template, readCallback } = createFeedResourceTemplate(ndk);
mcpServer.registerResource(
  "nostr-feed",
  template,
  {
    title: "Nostr Event Feed",
    description: "Subscribe to a stream of Nostr events from a specific user, optionally filtered by event kinds",
    mimeType: "application/x-ndjson"
  },
  readCallback
);

async function main() {
  // Connect to Nostr
  await connectToNostr();
  
  // Initialize subscription manager
  subscriptionManager = initializeSubscriptionManager(ndk);
  
  // Start the MCP server
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  
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