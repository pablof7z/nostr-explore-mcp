import { NostrTool } from './types.js';
import NDK, { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { resolveNostrContent } from './utils/contentResolver.js';

interface ConversationTrackerArgs {
  query: string;
  limit?: number;
  since?: number;
  until?: number;
  thread_depth?: number;
}

interface NostrThread {
  root_event: {
    id: string;
    author: string;
    content: string;
    created_at: number;
    tags: string[][];
  };
  replies: Array<{
    id: string;
    author: string;
    content: string;
    created_at: number;
    reply_to: string;
    tags: string[][];
  }>;
}

export const conversationTrackerTool: NostrTool = {
  schema: {
    name: 'mcp__nostrbook__nostr_conversation_tracker',
    description: 'Search for and retrieve conversational threads on Nostr based on specified criteria',
    inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keywords or hashtags to find conversations'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of conversation threads to return',
        default: 20,
        minimum: 1,
        maximum: 100
      },
      since: {
        type: 'number',
        description: 'Unix timestamp for start of time range'
      },
      until: {
        type: 'number',
        description: 'Unix timestamp for end of time range'
      },
      thread_depth: {
        type: 'number',
        description: 'Maximum depth of replies to fetch for each thread',
        default: 2,
        minimum: 1,
        maximum: 10
      }
    },
    required: ['query']
    }
  },
  
  handler: async (args: ConversationTrackerArgs, ndk: NDK) => {
    try {
      const { query, limit = 20, since, until, thread_depth = 2 } = args;
      
      // Parse query for hashtags and search terms
      const hashtags = query.match(/#\w+/g)?.map(tag => tag.slice(1)) || [];
      const searchTerms = query.replace(/#\w+/g, '').trim();
      
      // Build filter for root events (kind:1 without 'e' tags or with 'root' marker)
      const filter: NDKFilter = {
        kinds: [1],
        limit: limit * 2 // Fetch more to account for filtering
      };
      
      // Add hashtag filters if present
      if (hashtags.length > 0) {
        filter['#t'] = hashtags;
      }
      
      // Add time range filters if provided
      if (since) {
        filter.since = since;
      }
      if (until) {
        filter.until = until;
      }
      
      // Fetch events
      const events = await ndk.fetchEvents(filter);
      
      // Filter for root events and search terms
      const rootEvents = Array.from(events).filter(event => {
        // Check if it's a root event (no 'e' tags or has 'root' marker)
        const eTags = event.tags.filter(tag => tag[0] === 'e');
        const isRoot = eTags.length === 0 || eTags.some(tag => tag[3] === 'root');
        
        if (!isRoot) return false;
        
        // Check if content matches search terms (if any)
        if (searchTerms) {
          return event.content.toLowerCase().includes(searchTerms.toLowerCase());
        }
        
        return true;
      }).slice(0, limit);
      
      // Build conversation threads
      const threads: NostrThread[] = [];
      
      for (const rootEvent of rootEvents) {
        const thread: NostrThread = {
          root_event: {
            id: rootEvent.id,
            author: rootEvent.pubkey,
            content: await resolveNostrContent(rootEvent.content, ndk),
            created_at: rootEvent.created_at || 0,
            tags: rootEvent.tags
          },
          replies: []
        };
        
        // Fetch replies recursively up to thread_depth
        const fetchedReplies = await fetchReplies(rootEvent.id, ndk, thread_depth);
        thread.replies = fetchedReplies;
        
        threads.push(thread);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            threads,
            metadata: {
              query,
              threads_found: threads.length,
              search_params: {
                hashtags,
                search_terms: searchTerms || null,
                since: since || null,
                until: until || null,
                thread_depth
              }
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      console.error('Error in conversation tracker:', error);
      return {
        content: [{
          type: 'text',
          text: `Error searching for conversations: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
};

async function fetchReplies(
  eventId: string,
  ndk: NDK,
  maxDepth: number,
  currentDepth: number = 0
): Promise<NostrThread['replies']> {
  if (currentDepth >= maxDepth) {
    return [];
  }
  
  const replies: NostrThread['replies'] = [];
  
  try {
    // Fetch direct replies to this event
    const replyFilter: NDKFilter = {
      kinds: [1],
      '#e': [eventId],
      limit: 50
    };
    
    const replyEvents = await ndk.fetchEvents(replyFilter);
    
    for (const reply of replyEvents) {
      // Check if this is a direct reply (not just a mention)
      const eTags = reply.tags.filter(tag => tag[0] === 'e');
      const isDirectReply = eTags.some(tag => 
        tag[1] === eventId && (tag[3] === 'reply' || tag[3] === undefined)
      );
      
      if (!isDirectReply) continue;
      
      const replyData = {
        id: reply.id,
        author: reply.pubkey,
        content: await resolveNostrContent(reply.content, ndk),
        created_at: reply.created_at || 0,
        reply_to: eventId,
        tags: reply.tags
      };
      
      replies.push(replyData);
      
      // Recursively fetch replies to this reply
      const nestedReplies = await fetchReplies(reply.id, ndk, maxDepth, currentDepth + 1);
      replies.push(...nestedReplies.map(nestedReply => ({
        ...nestedReply,
        reply_to: nestedReply.reply_to || reply.id
      })));
    }
    
  } catch (error) {
    console.error(`Error fetching replies for event ${eventId}:`, error);
  }
  
  // Sort replies by timestamp
  return replies.sort((a, b) => a.created_at - b.created_at);
}