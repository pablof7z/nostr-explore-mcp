import { Resource } from "@modelcontextprotocol/sdk/types.js";
import NDK, { NDKFilter, NDKEvent, NDKUser } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * FeedResource provides streaming access to Nostr events through MCP resources.
 * Supports URIs in the format: nostr://feed/{npub-or-pubkey}/{kinds}
 */
export class FeedResource {
  private ndk: NDK;

  constructor(ndk: NDK) {
    this.ndk = ndk;
  }

  /**
   * List available feed resources
   */
  async list(): Promise<Resource[]> {
    return [
      {
        uri: "nostr://feed/{npub-or-pubkey}/{kinds}",
        name: "Nostr Event Feed",
        description: "Subscribe to a stream of Nostr events from a specific user, optionally filtered by event kinds",
        mimeType: "application/x-ndjson"
      }
    ];
  }

  /**
   * Get a feed resource stream
   */
  async get(uri: string): Promise<string> {
    // Parse the URI
    if (!uri.startsWith("nostr://feed/")) {
      throw new Error("Invalid URI format. Expected: nostr://feed/{npub-or-pubkey}/{kinds}");
    }

    const parts = uri.slice("nostr://feed/".length).split('/');
    if (parts.length < 1) {
      throw new Error("Invalid URI format. Expected: nostr://feed/{npub-or-pubkey}/{kinds}");
    }

    // Parse the pubkey (handle both npub and hex formats)
    let pubkey = parts[0];
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
    if (parts[1]) {
      kinds = parts[1].split(',').map(k => {
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

    // For now, we'll collect events and return them as a batch
    // In a real streaming implementation, this would be handled differently
    const events: any[] = [];
    const subscription = this.ndk.subscribe(filter, { closeOnEose: false });

    return new Promise((resolve, reject) => {
      // Set a timeout to collect initial events
      const timeout = setTimeout(() => {
        subscription.stop();
        resolve(events.map(e => JSON.stringify(e)).join('\n'));
      }, 5000);

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
  }

  /**
   * Subscribe to a feed (for streaming support)
   * Note: This returns an async generator for true streaming
   */
  async *subscribe(uri: string): AsyncGenerator<string> {
    // Parse the URI
    if (!uri.startsWith("nostr://feed/")) {
      throw new Error("Invalid URI format. Expected: nostr://feed/{npub-or-pubkey}/{kinds}");
    }

    const parts = uri.slice("nostr://feed/".length).split('/');
    if (parts.length < 1) {
      throw new Error("Invalid URI format. Expected: nostr://feed/{npub-or-pubkey}/{kinds}");
    }

    // Parse the pubkey (handle both npub and hex formats)
    let pubkey = parts[0];
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
    if (parts[1]) {
      kinds = parts[1].split(',').map(k => {
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

    // Subscribe to events
    const subscription = this.ndk.subscribe(filter, { closeOnEose: false });

    try {
      // Create a queue for events
      const eventQueue: string[] = [];
      let resolveNext: ((value: IteratorResult<string>) => void) | null = null;
      let rejectNext: ((error: Error) => void) | null = null;
      let done = false;

      subscription.on('event', (event: NDKEvent) => {
        // Format the event, removing signature and id
        const formattedEvent = {
          created_at: event.created_at,
          content: event.content,
          kind: event.kind,
          pubkey: event.pubkey,
          tags: event.tags,
        };
        
        const eventString = JSON.stringify(formattedEvent);
        
        if (resolveNext) {
          resolveNext({ value: eventString, done: false });
          resolveNext = null;
          rejectNext = null;
        } else {
          eventQueue.push(eventString);
        }
      });

      subscription.on('error', (error: Error) => {
        done = true;
        if (rejectNext) {
          rejectNext(error);
          rejectNext = null;
          resolveNext = null;
        }
      });

      // Yield events as they come
      while (!done) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          // Wait for the next event
          yield await new Promise<string>((resolve, reject) => {
            resolveNext = (result) => resolve(result.value);
            rejectNext = reject;
          });
        }
      }
    } finally {
      subscription.stop();
    }
  }
}