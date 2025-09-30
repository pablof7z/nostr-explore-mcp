import { NostrTool } from './types.js';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { createSigner, getNsecSchema, isNsecRequired } from '../utils/signer.js';

interface NotePublisherArgs {
  content: string;
  nsec?: string;
  reply_to?: string;
  mentions?: string[];
  hashtags?: string[];
}

export const publishNote: NostrTool = {
  schema: {
    name: 'nostr_publish_note',
    description: 'Publish short notes to Nostr network using kind:1 standard with nsec for signing',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The note content to publish'
        },
        ...(getNsecSchema() ? { nsec: getNsecSchema() } : {}),
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
      required: ['content', ...(isNsecRequired() ? ['nsec'] : [])]
    }
  },
  
  handler: async (args: NotePublisherArgs, ndk: NDK) => {
    try {
      const { content, nsec, reply_to, mentions, hashtags } = args;

      // Create signer using utility function
      const signer = createSigner(nsec);
      if (!signer) {
        throw new Error('No signing credentials available. Please provide an nsec or set NOSTR_PRIVATE_KEY environment variable.');
      }

      let replyToEvent: NDKEvent | null = null;

      if (reply_to) {
        try {
          replyToEvent = await ndk.fetchEvent(reply_to);
        } catch {}
      }
      
      // Create a new note event (kind 1)
      const event = replyToEvent ? replyToEvent.reply() : new NDKEvent(ndk);
      event.kind ??= 1;
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
      try {
        await event.sign(signer);
      } catch (error) {
        console.error("Event", event.inspect)
        console.error("Error signing event", error)
      }
      await event.publish();

      return { content: {nevent: event.encode()} };
      
    } catch (error) {
      console.error('Error publishing note:', error);
      return {
        content: [{
          type: 'text',
          text: `Error publishing note: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
};