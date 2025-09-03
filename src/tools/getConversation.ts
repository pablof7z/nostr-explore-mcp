import { NostrTool } from "./types.js";
import { NDKEvent, NDKFilter, NDKUser } from "@nostr-dev-kit/ndk";
import { resolveNostrContent } from "./utils/contentResolver.js";

interface UserProfile {
  pubkey: string;
  npub: string;
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
}

export const getConversationTool: NostrTool = {
  schema: {
    name: "get_conversation",
    description: "Retrieve a full conversation thread from a Nostr event, including all parent messages up to the root",
    inputSchema: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "The event's bech32 identifier (nevent, note) or hex event ID",
        },
      },
      required: ["eventId"],
    },
  },
  handler: async (args, ndk) => {
    const { eventId } = args as { eventId: string };
    
    if (!eventId) {
      throw new Error("eventId is required");
    }

    // Fetch the requested event - NDK handles bech32 directly
    const requestedEvent = await ndk.fetchEvent(eventId);
    if (!requestedEvent) {
      throw new Error("Event not found");
    }

    // Find the root event ID
    let rootEventId: string | null = null;
    const eTags = requestedEvent.tags.filter(tag => tag[0] === "e");
    
    if (eTags.length === 0) {
      // This IS the root event
      rootEventId = requestedEvent.id;
    } else {
      // Check for marked tags (preferred format)
      const rootTag = eTags.find(tag => tag[3] === "root");
      if (rootTag) {
        rootEventId = rootTag[1];
      } else if (eTags.length === 1) {
        // Single e tag - assume it's the root
        rootEventId = eTags[0][1];
      } else {
        // Multiple e tags - first is root (deprecated positional format)
        rootEventId = eTags[0][1];
      }
    }

    // Fetch the root event if different from requested
    let rootEvent: NDKEvent | null = null;
    if (rootEventId === requestedEvent.id) {
      rootEvent = requestedEvent;
    } else {
      rootEvent = await ndk.fetchEvent(rootEventId);
      if (!rootEvent) {
        throw new Error("Root event not found");
      }
    }

    // Fetch all events that reference the root
    const threadFilter: NDKFilter = {
      kinds: [1],
      "#e": [rootEventId],
    };
    const allThreadEvents = await ndk.fetchEvents(threadFilter);

    // Build a map of all events in the thread
    const eventMap = new Map<string, NDKEvent>();
    eventMap.set(rootEventId, rootEvent);
    for (const event of allThreadEvents) {
      eventMap.set(event.id, event);
    }

    // Reconstruct the conversation path from requested event to root
    const conversationPath: NDKEvent[] = [];
    let currentEvent: NDKEvent | null = requestedEvent;
    
    while (currentEvent) {
      conversationPath.unshift(currentEvent);
      
      if (currentEvent.id === rootEventId) {
        break;
      }
      
      // Find parent event
      const eTags = currentEvent.tags.filter(tag => tag[0] === "e");
      let parentId: string | null = null;
      
      // Check for marked reply tag
      const replyTag = eTags.find(tag => tag[3] === "reply");
      if (replyTag) {
        parentId = replyTag[1];
      } else if (eTags.length === 1) {
        // Single e tag - it's the parent/root
        parentId = eTags[0][1];
      } else if (eTags.length >= 2) {
        // Multiple tags - last one is the direct parent (deprecated format)
        parentId = eTags[eTags.length - 1][1];
      }
      
      currentEvent = parentId ? eventMap.get(parentId) || null : null;
    }

    // Collect all unique pubkeys from the conversation
    const pubkeys = new Set<string>();
    for (const event of conversationPath) {
      pubkeys.add(event.pubkey);
    }

    // Fetch user profiles
    const profileFilter: NDKFilter = {
      kinds: [0],
      authors: Array.from(pubkeys),
    };
    const profileEvents = await ndk.fetchEvents(profileFilter);
    
    const profiles = new Map<string, UserProfile>();
    for (const profileEvent of profileEvents) {
      try {
        const content = JSON.parse(profileEvent.content);
        const user = new NDKUser({ pubkey: profileEvent.pubkey });
        profiles.set(profileEvent.pubkey, {
          pubkey: profileEvent.pubkey,
          npub: user.npub,
          name: content.name,
          display_name: content.display_name,
          picture: content.picture,
          about: content.about,
        });
      } catch (e) {
        // Invalid profile JSON, skip
      }
    }

    // Add default profiles for any missing pubkeys
    for (const pubkey of pubkeys) {
      if (!profiles.has(pubkey)) {
        const user = new NDKUser({ pubkey });
        profiles.set(pubkey, {
          pubkey,
          npub: user.npub,
        });
      }
    }

    // Format the conversation as markdown
    let markdown = "# Nostr Conversation Thread\n\n";
    
    for (let i = 0; i < conversationPath.length; i++) {
      const event = conversationPath[i];
      const profile = profiles.get(event.pubkey);
      const depth = i;
      const indent = "  ".repeat(depth);
      
      const displayName = profile?.display_name || profile?.name || profile?.npub?.slice(0, 12) + "...";
      const timestamp = new Date(event.created_at! * 1000).toLocaleString();
      
      // Resolve embedded content in the event
      const resolvedContent = await resolveNostrContent(event.content, ndk);
      
      markdown += `${indent}**${displayName}** • ${timestamp}\n`;
      if (i === conversationPath.length - 1) {
        markdown += `${indent}📍 *[Requested Event]*\n`;
      }
      markdown += `${indent}${resolvedContent.split('\n').join('\n' + indent)}\n\n`;
    }

    // Add metadata section
    markdown += "---\n## Thread Metadata\n\n";
    markdown += `- **Root Event ID**: \`${rootEventId}\`\n`;
    markdown += `- **Requested Event ID**: \`${requestedEvent.id}\`\n`;
    markdown += `- **Thread Depth**: ${conversationPath.length} messages\n`;
    markdown += `- **Participants**: ${pubkeys.size} users\n`;

    return {
      content: [
        {
          type: "text",
          text: markdown,
        },
      ],
    };
  }
};