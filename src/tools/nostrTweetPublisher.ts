import { NostrTool } from './types.js';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

interface TweetPublisherArgs {
  content: string;
  nsec: string;
  reply_to?: string;
  mentions?: string[];
  hashtags?: string[];
}

export const nostrTweetPublisher: NostrTool = {
  schema: {
    name: 'nostr_tweet_publisher',
    description: 'Publish short notes (tweets) to Nostr network using kind:1 standard with nsec for signing',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The note content to publish'
        },
        nsec: {
          type: 'string',
          description: 'The nsec (Nostr private key in bech32 format) for signing the event'
        },
        reply_to: {
          type: 'string',
          description: 'Optional event ID to reply to (creates an e tag)'
        },
        mentions: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of npub or hex pubkeys to mention in the note'
        },
        hashtags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of hashtags to include (without the # symbol)'
        }
      },
      required: ['content', 'nsec']
    }
  },
  
  handler: async (args: TweetPublisherArgs, ndk: NDK) => {
    try {
      const { content, nsec, reply_to, mentions, hashtags } = args;
      
      // Validate and decode nsec
      let privateKeyHex: string;
      try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec format');
        }
        privateKeyHex = decoded.data as string;
      } catch (error) {
        throw new Error(`Invalid nsec: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Create a signer with the private key
      const signer = new NDKPrivateKeySigner(privateKeyHex);
      const user = await signer.user();
      
      // Create a new note event (kind 1)
      const event = new NDKEvent(ndk);
      event.kind = 1; // Text note
      event.pubkey = user.pubkey;
      event.content = content;
      event.created_at = Math.floor(Date.now() / 1000);
      
      // Build tags array
      event.tags = [];
      
      // Add reply tag if replying to another event
      if (reply_to) {
        // Decode if it's a note1/nevent format
        let eventId = reply_to;
        if (reply_to.startsWith('note1')) {
          try {
            const decoded = nip19.decode(reply_to);
            if (decoded.type === 'note') {
              eventId = decoded.data as string;
            }
          } catch {
            // Use as-is if decode fails
          }
        } else if (reply_to.startsWith('nevent1')) {
          try {
            const decoded = nip19.decode(reply_to);
            if (decoded.type === 'nevent') {
              eventId = decoded.data.id;
            }
          } catch {
            // Use as-is if decode fails
          }
        }
        event.tags.push(['e', eventId, '', 'reply']);
      }
      
      // Add mention tags
      if (mentions && mentions.length > 0) {
        for (const mention of mentions) {
          let pubkey = mention;
          
          // Decode if it's an npub
          if (mention.startsWith('npub1')) {
            try {
              const decoded = nip19.decode(mention);
              if (decoded.type === 'npub') {
                pubkey = decoded.data as string;
              }
            } catch {
              // Use as-is if decode fails
            }
          }
          
          event.tags.push(['p', pubkey]);
        }
      }
      
      // Add hashtag tags
      if (hashtags && hashtags.length > 0) {
        for (const hashtag of hashtags) {
          // Remove # if present and add as t tag
          const cleanTag = hashtag.replace(/^#/, '');
          event.tags.push(['t', cleanTag]);
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
      
      // Generate npub for author
      const npub = nip19.npubEncode(event.pubkey);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            eventId: event.id,
            noteId,
            nevent,
            author: {
              pubkey: event.pubkey,
              npub
            },
            published_at: event.created_at,
            metadata: {
              content_length: content.length,
              reply_to: reply_to || null,
              mentions: mentions || [],
              hashtags: hashtags || [],
              tags_count: event.tags.length
            },
            urls: {
              primal: `https://primal.net/e/${noteId}`,
              coracle: `https://coracle.social/${noteId}`,
              snort: `https://snort.social/e/${noteId}`,
              nostrud: `https://nostrud.com/${nevent}`
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      console.error('Error publishing tweet:', error);
      return {
        content: [{
          type: 'text',
          text: `Error publishing tweet: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
};