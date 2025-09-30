import NDK, { NDKFilter, NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * Manages live subscriptions to Nostr feeds for MCP resource subscriptions
 */
export class ResourceSubscriptionManager {
  private subscriptions: Map<string, {
    subscription: NDKSubscription;
    onUpdate: (uri: string, event: NDKEvent) => void;
  }> = new Map();

  constructor(private ndk: NDK) {}

  /**
   * Subscribe to a Nostr feed resource
   * @param uri The resource URI (e.g., nostr://feed/pubkey/kinds)
   * @param onUpdate Callback when new events arrive
   */
  subscribe(uri: string, onUpdate: (uri: string, event: NDKEvent) => void): void {
    // Parse URI
    const parsedUri = new URL(uri);

    if (parsedUri.protocol !== 'nostr:' || !parsedUri.pathname.startsWith('//feed/')) {
      throw new Error(`Invalid nostr feed URI: ${uri}`);
    }

    // Extract pubkey and kinds from path
    const pathParts = parsedUri.pathname.split('/').filter(p => p);
    if (pathParts.length < 2) {
      throw new Error(`Invalid nostr feed URI format: ${uri}`);
    }

    const pubkey = this.parsePubkey(pathParts[1]);
    const kindsStr = pathParts[2];
    const kinds = kindsStr ? kindsStr.split(',').map(k => parseInt(k, 10)).filter(k => !isNaN(k)) : undefined;

    // Create NDK filter
    const filter: NDKFilter = { authors: [pubkey] };
    if (kinds && kinds.length > 0) {
      filter.kinds = kinds;
    }

    // Create subscription
    const ndkSubscription = this.ndk.subscribe(filter, { closeOnEose: false });

    // Handle events
    ndkSubscription.on('event', (event: NDKEvent) => {
      // Notify that the resource has been updated with the event content
      onUpdate(uri, event);
    });

    // Store subscription
    this.subscriptions.set(uri, {
      subscription: ndkSubscription,
      onUpdate
    });
  }

  /**
   * Unsubscribe from a resource
   */
  unsubscribe(uri: string): boolean {
    const sub = this.subscriptions.get(uri);
    if (!sub) {
      return false;
    }

    sub.subscription.stop();
    this.subscriptions.delete(uri);
    return true;
  }

  /**
   * Stop all subscriptions
   */
  stopAll(): void {
    for (const { subscription } of this.subscriptions.values()) {
      subscription.stop();
    }
    this.subscriptions.clear();
  }

  /**
   * Parse pubkey from npub or hex format
   */
  private parsePubkey(pubkey: string): string {
    if (pubkey.startsWith("npub")) {
      try {
        const decoded = nip19.decode(pubkey);
        if (decoded.type !== 'npub') {
          throw new Error("Invalid npub format");
        }
        return decoded.data as string;
      } catch (error) {
        throw new Error(`Invalid npub: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return pubkey;
  }
}
