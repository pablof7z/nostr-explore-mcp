import { NostrTool } from "../types.js";
import { NDKFilter, NDKEvent } from "@nostr-dev-kit/ndk";
import { resolveNostrContent } from "../utils/contentResolver.js";

interface ConversationTrackerParams {
  query: string;
  limit?: number;
  since?: number;
  until?: number;
  thread_depth?: number;
}

interface NostrThread {
  root_event: any;
  replies: any[];
  thread_metadata?: {
    total_replies: number;
    unique_authors: number;
    last_reply_at?: number;
  };
}

export const conversationTracker: NostrTool = {
  schema: {
    name: "nostr_conversation_tracker",
    description: "Searches for and retrieves conversational threads on Nostr based on specified criteria",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query, including keywords or hashtags (e.g., \"tenex\", \"#nostrdev\")",
        },
        limit: {
          type: "number",
          description: "The maximum number of root-level conversation threads to return. Defaults to 20",
        },
        since: {
          type: "number",
          description: "A Unix timestamp to retrieve events published after this time",
        },
        until: {
          type: "number",
          description: "A Unix timestamp to retrieve events published before this time",
        },
        thread_depth: {
          type: "number",
          description: "The depth of replies to fetch for each thread. 0 = root note only, 1 = root + direct replies, etc. Defaults to 2",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args, ndk) => {
    const { 
      query, 
      limit = 20, 
      since, 
      until, 
      thread_depth = 2 
    } = args as ConversationTrackerParams;

    // Parse query for hashtags and keywords
    const hashtags: string[] = [];
    const keywords: string[] = [];
    
    // Extract hashtags from query
    const hashtagMatches = query.match(/#\w+/g);
    if (hashtagMatches) {
      hashtags.push(...hashtagMatches.map(tag => tag.slice(1))); // Remove #
    }
    
    // Extract keywords (everything that's not a hashtag)
    const keywordQuery = query.replace(/#\w+/g, '').trim();
    if (keywordQuery) {
      keywords.push(...keywordQuery.split(/\s+/).filter(k => k.length > 0));
    }

    // Build filter for root events
    const filter: NDKFilter = {
      kinds: [1], // text notes
      limit: limit * 2, // Fetch more to account for filtering
    };

    if (hashtags.length > 0) {
      filter["#t"] = hashtags;
    }

    if (since) {
      filter.since = since;
    }

    if (until) {
      filter.until = until;
    }

    // Fetch potential root events
    const events = await ndk.fetchEvents(filter);
    
    // Filter for root events (no 'e' tags or marked as root)
    const rootEvents: NDKEvent[] = [];
    
    for (const event of events) {
      const eTags = event.tags.filter(tag => tag[0] === "e");
      
      // Check if this is a root event
      const isRoot = eTags.length === 0 || 
                     eTags.some(tag => tag[3] === "root" && tag[1] === event.id) ||
                     !eTags.some(tag => tag[3] === "reply" || tag[3] === "root");
      
      if (isRoot) {
        // If we have keywords, check if content matches
        if (keywords.length > 0) {
          const contentLower = event.content.toLowerCase();
          const hasKeyword = keywords.some(keyword => 
            contentLower.includes(keyword.toLowerCase())
          );
          if (!hasKeyword) continue;
        }
        
        rootEvents.push(event);
        
        if (rootEvents.length >= limit) break;
      }
    }

    // Now fetch replies for each root event up to thread_depth
    const threads: NostrThread[] = [];
    
    for (const rootEvent of rootEvents) {
      const thread: NostrThread = {
        root_event: {
          id: rootEvent.id,
          pubkey: rootEvent.pubkey,
          created_at: rootEvent.created_at,
          kind: rootEvent.kind,
          tags: rootEvent.tags,
          content: await resolveNostrContent(rootEvent.content, ndk),
          sig: rootEvent.sig,
        },
        replies: [],
      };

      if (thread_depth > 0) {
        // Fetch replies recursively
        const replies = await fetchReplies(ndk, rootEvent.id, thread_depth);
        thread.replies = replies;
        
        // Add thread metadata
        const uniqueAuthors = new Set([rootEvent.pubkey]);
        let lastReplyAt = rootEvent.created_at;
        
        const countReplies = (replies: any[]): number => {
          let count = replies.length;
          for (const reply of replies) {
            uniqueAuthors.add(reply.pubkey);
            if (reply.created_at && reply.created_at > lastReplyAt) {
              lastReplyAt = reply.created_at;
            }
            if (reply.replies && reply.replies.length > 0) {
              count += countReplies(reply.replies);
            }
          }
          return count;
        };
        
        const totalReplies = countReplies(replies);
        
        thread.thread_metadata = {
          total_replies: totalReplies,
          unique_authors: uniqueAuthors.size,
          last_reply_at: lastReplyAt > rootEvent.created_at ? lastReplyAt : undefined,
        };
      }

      threads.push(thread);
    }

    return {
      threads,
      search_metadata: {
        query,
        hashtags,
        keywords,
        total_threads_found: threads.length,
        filters_applied: {
          limit,
          since,
          until,
          thread_depth,
        },
      },
    };
  },
};

async function fetchReplies(
  ndk: any, 
  parentId: string, 
  remainingDepth: number
): Promise<any[]> {
  if (remainingDepth <= 0) return [];

  const replyFilter: NDKFilter = {
    kinds: [1],
    "#e": [parentId],
    limit: 100, // Reasonable limit per parent
  };

  const replyEvents = await ndk.fetchEvents(replyFilter);
  const replies: any[] = [];

  for (const replyEvent of replyEvents) {
    // Check if this is actually a reply to our parent
    const eTags = replyEvent.tags.filter((tag: string[]) => tag[0] === "e");
    const isDirectReply = eTags.some((tag: string[]) => 
      tag[1] === parentId && (tag[3] === "reply" || tag[3] === undefined)
    ) || (eTags.length === 1 && eTags[0][1] === parentId);

    if (isDirectReply) {
      const reply: any = {
        id: replyEvent.id,
        pubkey: replyEvent.pubkey,
        created_at: replyEvent.created_at,
        kind: replyEvent.kind,
        tags: replyEvent.tags,
        content: await resolveNostrContent(replyEvent.content, ndk),
        sig: replyEvent.sig,
        replies: [],
      };

      // Recursively fetch replies if we have remaining depth
      if (remainingDepth > 1) {
        reply.replies = await fetchReplies(ndk, replyEvent.id, remainingDepth - 1);
      }

      replies.push(reply);
    }
  }

  return replies;
}

export default conversationTracker;