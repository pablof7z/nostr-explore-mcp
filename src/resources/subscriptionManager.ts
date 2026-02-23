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

    if (parsedUri.protocol !== 'nostr:') {
      throw new Error(`Invalid nostr URI: ${uri}`);
    }

    // For nostr://host/path, URL parses: hostname=host, pathname=/path
    const host = parsedUri.hostname; // 'feed' or 'user'
    const pathParts = parsedUri.pathname.split('/').filter(p => p);

    let filter: NDKFilter;

    if (host === 'feed') {
      // nostr://feed/{pubkey}/{kinds}
      if (pathParts.length < 1) {
        throw new Error(`Invalid nostr feed URI format: ${uri}`);
      }

      const user = await resolveUser(pathParts[0], this.ndk);
      const pubkey = user.pubkey;
      if (!pubkey) {
        throw new Error(`Failed to resolve pubkey from: ${pathParts[0]}`);
      }

      const kindsStr = pathParts[1];
      const kinds = kindsStr ? kindsStr.split(',').map(k => parseInt(k, 10)).filter(k => !isNaN(k)) : undefined;

      filter = { authors: [pubkey] };
      if (kinds && kinds.length > 0) {
        filter.kinds = kinds;
      }
    } else if (host === 'user' && pathParts[pathParts.length - 1] === 'notes') {
      // nostr://user/{userId}/notes
      if (pathParts.length < 2) {
        throw new Error(`Invalid nostr user notes URI format: ${uri}`);
      }

      const user = await resolveUser(pathParts[0], this.ndk);
      const pubkey = user.pubkey;
      if (!pubkey) {
        throw new Error(`Failed to resolve pubkey from: ${pathParts[0]}`);
      }

      filter = { kinds: [1], authors: [pubkey] };
    } else if (host === 'notifications') {
      // nostr://notifications/{userId}
      if (pathParts.length < 1) {
        throw new Error(`Invalid nostr notifications URI format: ${uri}`);
      }

      const user = await resolveUser(pathParts[0], this.ndk);
      const pubkey = user.pubkey;
      if (!pubkey) {
        throw new Error(`Failed to resolve pubkey from: ${pathParts[0]}`);
      }

      filter = { "#p": [pubkey] } as NDKFilter;
    } else {
      throw new Error(`Unsupported nostr resource URI: ${uri}`);
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
