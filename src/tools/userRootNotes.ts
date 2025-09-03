import { NostrTool } from "./types.js";
import { NDKEvent, NDKFilter, NDKUser } from "@nostr-dev-kit/ndk";
import { resolveNostrContent } from "./utils/contentResolver.js";

export const userRootNotesTool: NostrTool = {
  schema: {
    name: "user_root_notes",
    description: "Get all root notes (kind:1 events without 'e' tags) from a specific Nostr user",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user's npub or hex pubkey",
        },
        resolveContent: {
          type: "boolean",
          description: "Whether to resolve embedded nostr: references in the content (default: false)",
        },
      },
      required: ["userId"],
    },
  },
  handler: async (args, ndk) => {
    const { userId, resolveContent = false } = args as { userId: string; resolveContent?: boolean };
    
    if (!userId) {
      throw new Error("userId is required");
    }

    const user = userId.startsWith("npub") 
      ? new NDKUser({ npub: userId })
      : new NDKUser({ pubkey: userId });

    if (!user.pubkey) {
      throw new Error("Invalid user ID provided");
    }

    const filter: NDKFilter = {
      kinds: [1],
      authors: [user.pubkey],
      limit: 100,
    };

    const events = await ndk.fetchEvents(filter);
    
    const rootNotes: NDKEvent[] = [];
    for (const event of events) {
      const eTags = event.tags.filter(tag => tag[0] === "e");
      if (eTags.length === 0) {
        rootNotes.push(event);
      }
    }

    const formattedNotes = await Promise.all(rootNotes.map(async event => {
      const content = resolveContent 
        ? await resolveNostrContent(event.content, ndk)
        : event.content;
      
      return {
        id: event.id,
        created_at: event.created_at,
        content,
        tags: event.tags,
        sig: event.sig,
      };
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            user: {
              npub: user.npub,
              pubkey: user.pubkey,
            },
            rootNotesCount: formattedNotes.length,
            rootNotes: formattedNotes,
          }, null, 2),
        },
      ],
    };
  }
};