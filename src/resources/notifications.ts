import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";
import { resolveUser } from "../utils/userResolver.js";

/**
 * Creates a ResourceTemplate for mentions/notifications of a pubkey.
 * Supports URIs in the format: nostr://notifications/{userId}
 *
 * userId can be NIP-05, npub, nprofile, or hex pubkey.
 *
 * Query parameters:
 * - limit: Maximum number of events to fetch (default: 50)
 * - since: Unix timestamp to fetch events after
 */
export function createNotificationsResourceTemplate(ndk: NDK): {
  template: ResourceTemplate;
  readCallback: ReadResourceTemplateCallback;
} {
  const template = new ResourceTemplate(
    "nostr://notifications/{userId}",
    { list: undefined }
  );

  const readCallback: ReadResourceTemplateCallback = async (
    uri: URL,
    variables: { userId: string }
  ): Promise<ReadResourceResult> => {
    const user = await resolveUser(variables.userId, ndk);
    if (!user.pubkey) throw new Error("Invalid user ID provided");

    const limit = parseInt(uri.searchParams.get('limit') || '50', 10);
    const sinceParam = uri.searchParams.get('since');
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

    const filter: Record<string, unknown> = { "#p": [user.pubkey], limit };
    if (since) filter.since = since;

    const events = await ndk.fetchEvents(filter as any);

    const text = [...events]
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .map(e => JSON.stringify({ id: e.id, created_at: e.created_at, kind: e.kind, pubkey: e.pubkey, content: e.content, tags: e.tags }))
      .join('\n');

    return {
      contents: [{ uri: uri.href, mimeType: "application/x-ndjson", text }]
    };
  };

  return { template, readCallback };
}
