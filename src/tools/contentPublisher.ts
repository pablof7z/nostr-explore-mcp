import { NostrTool } from './types.js';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

interface ContentPublisherArgs {
  title: string;
  content: string;
  summary?: string;
  image?: string;
  tags?: Array<Array<string>>;
  published_at?: number;
}

export const contentPublisherTool: NostrTool = {
  schema: {
    name: 'mcp__nostrbook__nostr_content_publisher',
    description: 'Publish long-form content (articles) to Nostr network using kind:30023 standard',
    inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the article'
      },
      content: {
        type: 'string',
        description: 'Main content of the article in Markdown format'
      },
      summary: {
        type: 'string',
        description: 'Brief summary or excerpt of the article'
      },
      image: {
        type: 'string',
        description: 'URL of a header/banner image for the article'
      },
      tags: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        description: 'Additional tags as array of tag arrays (e.g. [["t", "hashtag"], ["category", "tech"]])'
      },
      published_at: {
        type: 'number',
        description: 'Unix timestamp for when the article should be marked as published'
      }
    },
    required: ['title', 'content']
    }
  },
  
  handler: async (args: ContentPublisherArgs, ndk: NDK) => {
    try {
      const { title, content, summary, image, tags, published_at } = args;
      
      // Check if we have a private key configured
      const privateKey = process.env.NOSTR_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('NOSTR_PRIVATE_KEY environment variable is not set. Unable to publish content.');
      }
      
      // Create a signer with the private key
      const signer = new NDKPrivateKeySigner(privateKey);
      const user = await signer.user();
      
      // Create a new long-form content event (kind 30023)
      const event = new NDKEvent(ndk);
      event.kind = 30023; // Long-form content
      event.pubkey = user.pubkey;
      event.content = content;
      event.created_at = published_at || Math.floor(Date.now() / 1000);
      
      // Build tags array
      event.tags = [];
      
      // Add required 'd' tag (unique identifier for replaceable event)
      // Using a combination of timestamp and title slug for uniqueness
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
      const dTag = `${Date.now()}-${slug}`;
      event.tags.push(['d', dTag]);
      
      // Add title tag
      event.tags.push(['title', title]);
      
      // Add summary tag if provided
      if (summary) {
        event.tags.push(['summary', summary]);
      }
      
      // Add image tag if provided
      if (image) {
        event.tags.push(['image', image]);
      }
      
      // Add published_at tag
      event.tags.push(['published_at', String(event.created_at)]);
      
      // Add additional tags if provided
      if (tags && tags.length > 0) {
        for (const tagArray of tags) {
          if (Array.isArray(tagArray) && tagArray.length > 0) {
            event.tags.push(tagArray);
          }
        }
      }
      
      // Sign the event
      await event.sign(signer);
      
      // Publish the event
      await event.publish();
      
      // Generate noteId (bech32 encoded event id)
      const noteId = nip19.noteEncode(event.id);
      
      // Generate nevent (includes relay hints)
      const neventData = {
        id: event.id,
        relays: ['wss://relay.primal.net', 'wss://tenex.chat'],
        author: event.pubkey
      };
      const nevent = nip19.neventEncode(neventData);
      
      // Generate naddr (for replaceable events)
      const naddrData = {
        identifier: dTag,
        pubkey: event.pubkey,
        kind: 30023,
        relays: ['wss://relay.primal.net', 'wss://tenex.chat']
      };
      const naddr = nip19.naddrEncode(naddrData);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            eventId: event.id,
            noteId,
            nevent,
            naddr,
            author: event.pubkey,
            published_at: event.created_at,
            metadata: {
              title,
              summary: summary || null,
              image: image || null,
              additional_tags: tags || [],
              d_tag: dTag,
              content_length: content.length
            },
            urls: {
              primal: `https://primal.net/e/${noteId}`,
              nostrud: `https://nostrud.com/${naddr}`,
              habla: `https://habla.news/a/${naddr}`
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      console.error('Error publishing content:', error);
      return {
        content: [{
          type: 'text',
          text: `Error publishing content: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
};