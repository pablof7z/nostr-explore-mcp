import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import NDK, { NDKFilter, NDKEvent, NDKUser } from "@nostr-dev-kit/ndk";
import { resolveNostrContent } from "../tools/utils/contentResolver.js";

/**
 * Creates a ResourceTemplate for user root notes
 * Supports URIs in the format: nostr://user/{userId}/notes
 *
 * Query parameters:
 * - limit: Maximum number of notes to fetch (default: 100)
 * - resolveContent: Whether to resolve embedded nostr: references (default: false)
 */
export function createUserNotesResourceTemplate(ndk: NDK): {
  template: ResourceTemplate;
  readCallback: ReadResourceTemplateCallback;
} {
  const template = new ResourceTemplate(
    "nostr://user/{userId}/notes",
    {
      list: undefined,
    }
  );

  const readCallback: ReadResourceTemplateCallback = async (
    uri: URL,
    variables: { userId: string }
  ): Promise<ReadResourceResult> => {
    const { userId } = variables;

    // Parse query parameters
    const limit = parseInt(uri.searchParams.get('limit') || '100', 10);
    const resolveContent = uri.searchParams.get('resolveContent') === 'true';

    // Create NDK user from npub or hex pubkey
    const user = userId.startsWith("npub")
      ? new NDKUser({ npub: userId })
      : new NDKUser({ pubkey: userId });

    if (!user.pubkey) {
      throw new Error("Invalid user ID provided");
    }

    // Fetch all kind:1 events from this user
    const filter: NDKFilter = {
      kinds: [1],
      authors: [user.pubkey],
      limit,
    };

    const events = await ndk.fetchEvents(filter);

    // Filter to only root notes (no 'e' tags)
    const rootNotes: NDKEvent[] = [];
    for (const event of events) {
      const eTags = event.tags.filter(tag => tag[0] === "e");
      if (eTags.length === 0) {
        rootNotes.push(event);
      }
    }

    // Format as NDJSON
    const formattedNotes = await Promise.all(rootNotes.map(async event => {
      const content = resolveContent
        ? await resolveNostrContent(event.content, ndk)
        : event.content;

      return {
        id: event.id,
        created_at: event.created_at,
        content,
        kind: event.kind,
        pubkey: event.pubkey,
        tags: event.tags,
      };
    }));

    const text = formattedNotes.map(note => JSON.stringify(note)).join('\n');

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
