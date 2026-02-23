import { NostrTool } from "./types.js";
import NDK from "@nostr-dev-kit/ndk";
import { SubscriptionManager } from "../notifications/SubscriptionManager.js";

let subscriptionManager: SubscriptionManager | null = null;

export function initializeSubscriptionManager(ndk: NDK): SubscriptionManager {
  if (!subscriptionManager) {
    subscriptionManager = new SubscriptionManager(ndk);
  }
  return subscriptionManager;
}

export const startNotificationMonitoringTool: NostrTool = {
  schema: {
    name: "start_notification_monitoring",
    description: "Start monitoring Nostr events that mention a specific agent pubkey",
    inputSchema: {
      type: "object",
      properties: {
        agentPubkey: {
          type: "string",
          description: "The public key of the agent to monitor mentions for"
        }
      },
      required: ["agentPubkey"]
    }
  },
  handler: async (args: { agentPubkey: string }, ndk: NDK) => {
    const manager = initializeSubscriptionManager(ndk);
    
    try {
      await manager.addSubscription(args.agentPubkey);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Started monitoring notifications for agent: ${args.agentPubkey}`,
              timestamp: Math.floor(Date.now() / 1000)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Failed to start monitoring"
            }, null, 2)
          }
        ]
      };
    }
  }
};

export const stopNotificationMonitoringTool: NostrTool = {
  schema: {
    name: "stop_notification_monitoring",
    description: "Stop monitoring Nostr events for a specific agent",
    inputSchema: {
      type: "object",
      properties: {
        agentPubkey: {
          type: "string",
          description: "The public key of the agent to stop monitoring"
        }
      },
      required: ["agentPubkey"]
    }
  },
  handler: async (args: { agentPubkey: string }, ndk: NDK) => {
    const manager = initializeSubscriptionManager(ndk);
    
    const stopped = manager.removeSubscription(args.agentPubkey);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: stopped,
            message: stopped 
              ? `Stopped monitoring notifications for agent: ${args.agentPubkey}`
              : `No active monitoring found for agent: ${args.agentPubkey}`
          }, null, 2)
        }
      ]
    };
  }
};

export const getNotificationsTool: NostrTool = {
  schema: {
    name: "get_notifications",
    description: "Retrieve stored notifications for a monitored agent",
    inputSchema: {
      type: "object",
      properties: {
        agentPubkey: {
          type: "string",
          description: "The public key of the agent to get notifications for"
        },
        limit: {
          type: "number",
          description: "Maximum number of notifications to return",
          default: 50
        },
        since: {
          type: "number",
          description: "Unix timestamp to get notifications after"
        }
      },
      required: ["agentPubkey"]
    }
  },
  handler: async (args: { agentPubkey: string; limit?: number; since?: number }, ndk: NDK) => {
    const manager = initializeSubscriptionManager(ndk);
    const service = manager.getService(args.agentPubkey);
    
    if (!service) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `No monitoring service found for agent: ${args.agentPubkey}`
            }, null, 2)
          }
        ]
      };
    }
    
    const notifications = service.getNotifications({
      limit: args.limit,
      since: args.since
    });
    
    const status = service.getStatus();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            agentPubkey: args.agentPubkey,
            status: {
              isActive: status.isActive,
              eventCount: status.eventCount,
              startTime: status.startTime,
              storageSize: status.storageSize
            },
            notifications: notifications.map(n => ({
              created_at: n.created_at,
              content: n.content,
              tags: n.tags,
              kind: n.kind
            })),
            count: notifications.length
          }, null, 2)
        }
      ]
    };
  }
};

export const getActiveSubscriptionsTool: NostrTool = {
  schema: {
    name: "get_active_subscriptions",
    description: "List all active notification monitoring subscriptions",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  handler: async (_args: any, ndk: NDK) => {
    const manager = initializeSubscriptionManager(ndk);
    const subscriptions = manager.getActiveSubscriptions();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            activeCount: manager.getActiveCount(),
            subscriptions: subscriptions.map(sub => ({
              agentPubkey: sub.agentPubkey,
              startedAt: sub.startedAt,
              eventCount: sub.eventCount
            }))
          }, null, 2)
        }
      ]
    };
  }
};

export const notificationTools: NostrTool[] = [
  startNotificationMonitoringTool,
  stopNotificationMonitoringTool,
  getNotificationsTool,
  getActiveSubscriptionsTool
];
