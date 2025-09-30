import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import NDK, { NDKFilter, NDKEvent, NDKSubscriptionOptions } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * Creates a ResourceTemplate for Nostr feeds and the corresponding read callback.
 * Supports URIs in the format: nostr://feed/{pubkey}/{kinds}
 * 
 * Optional query parameters:
 * - relays: Comma-separated list of relay URLs to use for the subscription
 *   Example: nostr://feed/{pubkey}/{kinds}?relays=wss://relay1.com,wss://relay2.com
 *   If not specified, uses the default relays configured in the NDK instance
 */
export function createFeedResourceTemplate(ndk: NDK): {
  template: ResourceTemplate;
  readCallback: ReadResourceTemplateCallback;
} {
  // Create the template with URI pattern
  const template = new ResourceTemplate(
    "nostr://feed/{pubkey}/{kinds}",
    {
      // We don't provide a list callback since feeds are dynamic
      list: undefined,
      // Optional: Add completion callbacks for better UX
      complete: {
        kinds: (value) => {
          // Suggest common Nostr event kinds
          const commonKinds = [
            "1",     // Short Text Note
            "3",     // Contact List
            "4",     // Encrypted Direct Message
            "5",     // Event Deletion
            "6",     // Repost
            "7",     // Reaction
            "30023", // Long-form Content
            "1111",  // Comment
          ];
          return commonKinds.filter(k => k.startsWith(value));
        }
      }
    }
  );

  // Create the read callback
  const readCallback: ReadResourceTemplateCallback = async (
    uri: URL,
    variables: { pubkey: string; kinds?: string }
  ): Promise<ReadResourceResult> => {
    // Parse the pubkey (handle both npub and hex formats)
    let pubkey = variables.pubkey;
    if (pubkey.startsWith("npub")) {
      try {
        const decoded = nip19.decode(pubkey);
        if (decoded.type !== 'npub') {
          throw new Error("Invalid npub format");
        }
        pubkey = decoded.data as string;
      } catch (error) {
        throw new Error(`Invalid npub: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Parse kinds if provided
    let kinds: number[] | undefined;
    if (variables.kinds) {
      kinds = variables.kinds.split(',').map(k => {
        const kind = parseInt(k, 10);
        if (isNaN(kind)) {
          throw new Error(`Invalid kind: ${k}`);
        }
        return kind;
      });
    }

    // Create the filter
    const filter: NDKFilter = {
      authors: [pubkey],
    };

    if (kinds && kinds.length > 0) {
      filter.kinds = kinds;
    }

    // Parse relay URLs from query parameters
    const subscriptionOptions: NDKSubscriptionOptions = { closeOnEose: false };
    const relaysParam = uri.searchParams.get('relays');
    
    if (relaysParam) {
      // Split the comma-separated list of relay URLs
      const relayUrls = relaysParam.split(',').map(url => url.trim()).filter(url => url.length > 0);
      
      if (relayUrls.length > 0) {
        // Validate that each URL starts with ws:// or wss://
        for (const relayUrl of relayUrls) {
          if (!relayUrl.startsWith('ws://') && !relayUrl.startsWith('wss://')) {
            throw new Error(`Invalid relay URL: ${relayUrl}. Must start with ws:// or wss://`);
          }
        }
        
        // Set the explicit relay URLs for this subscription
        subscriptionOptions.relayUrls = relayUrls;
      }
    }

    // Collect events for a short period
    const events: any[] = [];
    const subscription = ndk.subscribe(filter, subscriptionOptions);

    return new Promise((resolve, reject) => {
      // Set a timeout to collect initial events
      const timeout = setTimeout(() => {
        subscription.stop();
        
        // Format as NDJSON (newline-delimited JSON)
        const text = events.map(e => JSON.stringify(e)).join('\n');
        
        resolve({
          contents: [{
            uri: uri.href,
            mimeType: "application/x-ndjson",
            text
          }]
        });
      }, 3000); // Reduced to 3 seconds for better responsiveness

      subscription.on('event', (event: NDKEvent) => {
        // Format the event, removing signature and id
        const formattedEvent = {
          created_at: event.created_at,
          content: event.content,
          kind: event.kind,
          pubkey: event.pubkey,
          tags: event.tags,
        };
        events.push(formattedEvent);
      });

      subscription.on('error', (error: Error) => {
        clearTimeout(timeout);
        subscription.stop();
        reject(error);
      });
    });
  };

  return {
    template,
    readCallback
  };
}