import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";
import { initializeSubscriptionManager } from "../tools/notifications.js";

/**
 * Creates a ResourceTemplate for agent notifications
 * Supports URIs in the format: nostr://notifications/{agentPubkey}
 *
 * Query parameters:
 * - limit: Maximum number of notifications to return (default: 50)
 * - since: Unix timestamp to get notifications after
 */
export function createNotificationsResourceTemplate(ndk: NDK): {
  template: ResourceTemplate;
  readCallback: ReadResourceTemplateCallback;
} {
  const template = new ResourceTemplate(
    "nostr://notifications/{agentPubkey}",
    {
      list: undefined,
    }
  );

  const readCallback: ReadResourceTemplateCallback = async (
    uri: URL,
    variables: { agentPubkey: string }
  ): Promise<ReadResourceResult> => {
    const { agentPubkey } = variables;

    // Parse query parameters
    const limit = parseInt(uri.searchParams.get('limit') || '50', 10);
    const sinceParam = uri.searchParams.get('since');
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

    // Get the subscription manager and service
    const manager = initializeSubscriptionManager(ndk);
    const service = manager.getService(agentPubkey);

    if (!service) {
      throw new Error(`No monitoring service found for agent: ${agentPubkey}. Use start_notification_monitoring tool first.`);
    }

    // Get notifications from the service
    const notifications = service.getNotifications({
      limit,
      since
    });

    // Format as NDJSON
    const formattedNotifications = notifications.map(n => ({
      created_at: n.created_at,
      content: n.content,
      kind: n.kind,
      pubkey: n.pubkey,
      tags: n.tags,
      id: n.id,
    }));

    const text = formattedNotifications.map(n => JSON.stringify(n)).join('\n');

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/x-ndjson",
        text
      }]
    };
  };

  return {
    template,
    readCallback
  };
}
