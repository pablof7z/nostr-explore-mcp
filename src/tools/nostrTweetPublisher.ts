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

      let replyToEvent: NDKEvent | null = null;

      if (reply_to) {
        try {
          replyToEvent = await ndk.fetchEvent(reply_to);
        } catch {}
      }
      
      // Create a signer with the private key
      const signer = new NDKPrivateKeySigner(nsec);
      
      // Create a new note event (kind 1)
      const event = replyToEvent ? replyToEvent.reply() : new NDKEvent(ndk);
      event.content = content;
      
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
      await event.publish();

      return { nevent: event.encode() };
      
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