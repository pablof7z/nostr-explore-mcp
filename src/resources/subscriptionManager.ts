import NDK, { NDKFilter, NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";
import { resolveUser } from "../utils/userResolver.js";

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
  async subscribe(uri: string, onUpdate: (uri: string, event: NDKEvent) => void): Promise<void> {
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

    // Resolve pubkey from NIP-05, npub, nprofile, or hex
    const user = await resolveUser(pathParts[1], this.ndk);
    const pubkey = user.pubkey;
    if (!pubkey) {
      throw new Error(`Failed to resolve pubkey from: ${pathParts[1]}`);
    }

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
}
