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
import { createUserNotesResourceTemplate } from "./resources/userNotes.js";
import { createNotificationsResourceTemplate } from "./resources/notifications.js";
import { ResourceSubscriptionManager } from "./resources/subscriptionManager.js";

const RELAYS = [
  "wss://relay.primal.net",
  "wss://tenex.chat"
];

const ndk = new NDK({
  explicitRelayUrls: RELAYS,
});

let subscriptionManager: ReturnType<typeof initializeSubscriptionManager> | null = null;
let resourceSubscriptionManager: ResourceSubscriptionManager | null = null;

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
  version: "0.1.0",
  capabilities: {
    resources: {
      subscribe: true
    }
  }
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

// Register resource templates
const feedResource = createFeedResourceTemplate(ndk);
mcpServer.registerResource(
  "nostr-feed",
  feedResource.template,
  {
    title: "Nostr Event Feed",
    description: "Subscribe to a stream of Nostr events from a specific user, optionally filtered by event kinds",
    mimeType: "application/x-ndjson"
  },
  feedResource.readCallback
);

const userNotesResource = createUserNotesResourceTemplate(ndk);
mcpServer.registerResource(
  "nostr-user-notes",
  userNotesResource.template,
  {
    title: "User Root Notes",
    description: "Get all root notes (kind:1 events without 'e' tags) from a specific Nostr user",
    mimeType: "application/x-ndjson"
  },
  userNotesResource.readCallback
);

const notificationsResource = createNotificationsResourceTemplate(ndk);
mcpServer.registerResource(
  "nostr-notifications",
  notificationsResource.template,
  {
    title: "Agent Notifications",
    description: "Retrieve stored notifications for a monitored agent",
    mimeType: "application/x-ndjson"
  },
  notificationsResource.readCallback
);

async function main() {
  // Connect to Nostr
  await connectToNostr();

  // Initialize subscription manager
  subscriptionManager = initializeSubscriptionManager(ndk);

  // Initialize resource subscription manager
  resourceSubscriptionManager = new ResourceSubscriptionManager(ndk);

  // Set up subscription handlers using the underlying server
  const SubscribeRequestSchema = z.object({
    method: z.literal('resources/subscribe'),
    params: z.object({
      uri: z.string(),
    }).optional(),
  });

  const UnsubscribeRequestSchema = z.object({
    method: z.literal('resources/unsubscribe'),
    params: z.object({
      uri: z.string(),
    }).optional(),
  });

  mcpServer.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params?.uri;
    if (!uri) {
      throw new Error('Missing required parameter: uri');
    }

    if (!resourceSubscriptionManager) {
      throw new Error('Resource subscription manager not initialized');
    }

    // Subscribe and send notifications when updates occur
    resourceSubscriptionManager.subscribe(uri, (updatedUri, event) => {
      // Send notification to client with event content
      mcpServer.server.sendResourceUpdated({
        uri: updatedUri,
      });
    });

    return {};
  });

  mcpServer.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    const uri = request.params?.uri;
    if (!uri) {
      throw new Error('Missing required parameter: uri');
    }

    if (!resourceSubscriptionManager) {
      throw new Error('Resource subscription manager not initialized');
    }

    const success = resourceSubscriptionManager.unsubscribe(uri);
    if (!success) {
      throw new Error(`No active subscription found for URI: ${uri}`);
    }

    return {};
  });

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
  if (resourceSubscriptionManager) {
    resourceSubscriptionManager.stopAll();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error("Shutting down gracefully...");
  if (subscriptionManager) {
    subscriptionManager.stopAll();
  }
  if (resourceSubscriptionManager) {
    resourceSubscriptionManager.stopAll();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});