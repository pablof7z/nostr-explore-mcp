import { NostrTool } from '../types.js';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import {
  createSigner,
  getNsecSchema,
  getPublishAsSchema,
  isNsecRequired,
} from '../../utils/signer.js';

interface RawPublishArgs {
  event: string;  // JSON string of the unsigned event
  nsec?: string;
  publish_as?: string;
}

export const publishRaw: NostrTool = {
  schema: {
    name: 'nostr_publish_raw',
    description: 'Sign and publish a raw Nostr event. Takes an unsigned event payload as JSON and returns the nevent1 encoded ID.',
    inputSchema: (() => {
      const properties: any = {
        event: {
          type: 'string',
          description: 'The unsigned event payload as a JSON string (must include "kind", "content", and optionally "tags")'
        }
      };
      
      const nsecSchema = getNsecSchema();
      if (nsecSchema) {
        properties.nsec = nsecSchema;
      }

      properties.publish_as = getPublishAsSchema();
      
      const required = ['event'];
      if (isNsecRequired()) {
        required.push('nsec');
      }
      
      return {
        type: 'object',
        properties,
        required
      };
    })()
  },
  
  handler: async (args: RawPublishArgs, ndk: NDK) => {
    try {
      const { event: eventJson, nsec, publish_as } = args;
      
      // Parse the event JSON
      let eventData;
      try {
        eventData = JSON.parse(eventJson);
      } catch (parseError) {
        throw new Error(`Invalid JSON event payload: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
      }
      
      // Validate required event fields
      if (typeof eventData.kind !== 'number') {
        throw new Error('Event must have a "kind" field with a numeric value');
      }
      if (typeof eventData.content !== 'string') {
        throw new Error('Event must have a "content" field with a string value');
      }
      if (!Array.isArray(eventData.tags)) {
        eventData.tags = []; // Tags are optional, default to empty array
      }
      
      // Create signer
      const signer = await createSigner(ndk, {
        nsec,
        publishAs: publish_as,
      });
      if (!signer) {
        throw new Error('No signing credentials available. Please provide nsec, set NOSTR_PRIVATE_KEY, or configure NOSTR_BUNKER_KEY/publish_as.');
      }
      
      // Create NDK event from the provided data
      const event = new NDKEvent(ndk);
      event.kind = eventData.kind;
      event.content = eventData.content;
      event.tags = eventData.tags;
      
      // Copy over created_at if provided, otherwise NDK will set it
      if (eventData.created_at) {
        event.created_at = eventData.created_at;
      }
      
      // Sign the event
      await event.sign(signer);
      
      // Publish the event
      const relaySet = await event.publish();
      const relays = [...relaySet].map(r => r.url);
      const result = { nevent1: event.encode(), relays };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
      
    } catch (error) {
      console.error('Error publishing raw event:', error);
      return {
        content: [{
          type: 'text',
          text: `Error publishing raw event: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
};
