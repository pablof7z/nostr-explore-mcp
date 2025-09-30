import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import NDK, { NDKFilter, NDKEvent, NDKSubscriptionOptions } from "@nostr-dev-kit/ndk";
import { resolveUser } from "../utils/userResolver.js";

// Constants
const INITIAL_EVENT_TIMEOUT_MS = 3000; // Timeout in milliseconds to wait for the initial burst of events from relays

/**
 * Resolves a user identifier to hex pubkey
 * Supports: NIP-05, npub, nprofile, and hex pubkey
 * @param userIdentifier The user identifier
 * @param ndk NDK instance
 * @returns The hex-encoded pubkey
 * @throws Error if the identifier is invalid
 */
async function resolvePubkey(userIdentifier: string, ndk: NDK): Promise<string> {
  const user = await resolveUser(userIdentifier, ndk);
  if (!user.pubkey) {
    throw new Error(`Failed to resolve pubkey from: ${userIdentifier}`);
  }
  return user.pubkey;
}

/**
 * Parses a comma-separated string of kinds into an array of numbers.
 * @param kindsStr The comma-separated kinds string
 * @returns Array of kind numbers or undefined if no kinds specified
 * @throws Error if any kind is not a valid number
 */
function parseKinds(kindsStr?: string): number[] | undefined {
  if (!kindsStr) {
    return undefined;
  }

  const kinds = kindsStr.split(',').map(k => {
    const kind = parseInt(k, 10);
    if (isNaN(kind)) {
      throw new Error(`Invalid kind: ${k}`);
    }
    return kind;
  });

  return kinds.length > 0 ? kinds : undefined;
}

/**
 * Parses and validates relay URLs from the query string.
 * @param uri The URI containing query parameters
 * @returns Array of validated relay URLs or undefined if none specified
 * @throws Error if any relay URL is invalid
 */
function parseRelays(uri: URL): string[] | undefined {
  const relaysParam = uri.searchParams.get('relays');
  
  if (!relaysParam) {
    return undefined;
  }

  const relayUrls = relaysParam
    .split(',')
    .map(url => url.trim())
    .filter(url => url.length > 0);
  
  if (relayUrls.length === 0) {
    return undefined;
  }

  // Validate that each URL starts with ws:// or wss://
  for (const relayUrl of relayUrls) {
    if (!relayUrl.startsWith('ws://') && !relayUrl.startsWith('wss://')) {
      throw new Error(`Invalid relay URL: ${relayUrl}. Must start with ws:// or wss://`);
    }
  }

  return relayUrls;
}

/**
 * Creates the NDK filter object for subscriptions.
 * @param pubkey The hex-encoded pubkey
 * @param kinds Optional array of event kinds to filter
 * @returns The configured NDK filter
 */
function createNostrFilter(pubkey: string, kinds?: number[]): NDKFilter {
  const filter: NDKFilter = {
    authors: [pubkey],
  };

  if (kinds && kinds.length > 0) {
    filter.kinds = kinds;
  }

  return filter;
}

/**
 * Formats a Nostr event by removing id and signature fields.
 * @param event The NDKEvent to format
 * @returns The formatted event without id and sig
 */
function formatNostrEvent(event: NDKEvent): Partial<NDKEvent> {
  return {
    created_at: event.created_at,
    content: event.content,
    kind: event.kind,
    pubkey: event.pubkey,
    tags: event.tags,
  };
}

/**
 * Creates subscription options with optional relay URLs.
 * @param relayUrls Optional array of relay URLs
 * @returns The configured subscription options
 */
function createSubscriptionOptions(relayUrls?: string[]): NDKSubscriptionOptions {
  const options: NDKSubscriptionOptions = { closeOnEose: false };
  
  if (relayUrls && relayUrls.length > 0) {
    options.relayUrls = relayUrls;
  }

  return options;
}

/**
 * Collects events from a subscription for a specified duration.
 * @param ndk The NDK instance
 * @param filter The filter for the subscription
 * @param options The subscription options
 * @param uri The original URI for the response
 * @returns Promise resolving to the resource result
 */
async function collectEvents(
  ndk: NDK,
  filter: NDKFilter,
  options: NDKSubscriptionOptions,
  uri: URL
): Promise<ReadResourceResult> {
  const events: any[] = [];
  const subscription = ndk.subscribe(filter, options);

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
    }, INITIAL_EVENT_TIMEOUT_MS);

    subscription.on('event', (event: NDKEvent) => {
      const formattedEvent = formatNostrEvent(event);
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
 * Creates a ResourceTemplate for Nostr feeds and the corresponding read callback.
 * Supports URIs in the format: nostr://feed/{pubkey}/{kinds}
 *
 * pubkey can be:
 * - NIP-05 identifier (user@domain.com)
 * - npub
 * - nprofile
 * - hex pubkey
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
    // Resolve pubkey from NIP-05, npub, nprofile, or hex
    const pubkey = await resolvePubkey(variables.pubkey, ndk);
    const kinds = parseKinds(variables.kinds);
    const relayUrls = parseRelays(uri);

    // Create filter and subscription options
    const filter = createNostrFilter(pubkey, kinds);
    const subscriptionOptions = createSubscriptionOptions(relayUrls);

    // Collect and return events
    return collectEvents(ndk, filter, subscriptionOptions, uri);
  };

  return {
    template,
    readCallback
  };
}