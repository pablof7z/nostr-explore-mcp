import NDK, {
  NDKUser,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export interface SignerOptions {
  nsec?: string;
  publishAs?: string;
}

function getLocalPrivateKey(nsec?: string): string | null {
  if (nsec) {
    return nsec;
  }

  const envPrivateKey = process.env.NOSTR_PRIVATE_KEY;
  if (envPrivateKey) {
    return envPrivateKey;
  }

  return null;
}

function trimNostrPrefix(value: string): string {
  return value.startsWith("nostr:") ? value.slice("nostr:".length) : value;
}

function getConnectedRelayUrls(ndk: NDK): string[] {
  return Array.from(
    new Set(ndk.pool.connectedRelays().map((relay) => relay.url)),
  );
}

function buildBunkerUriFromPubkey(ndk: NDK, pubkey: string): string {
  const connectedRelays = getConnectedRelayUrls(ndk);
  if (connectedRelays.length === 0) {
    return `bunker://${pubkey}`;
  }

  const query = new URLSearchParams();
  for (const relayUrl of connectedRelays) {
    query.append("relay", relayUrl);
  }

  return `bunker://${pubkey}?${query.toString()}`;
}

function extractPubkeyFromInput(input: string): string | null {
  const normalized = trimNostrPrefix(input.trim());

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (normalized.startsWith("npub1") || normalized.startsWith("nprofile1")) {
    const decoded = nip19.decode(normalized);
    if (decoded.type === "npub") {
      return (decoded.data as string).toLowerCase();
    }
    if (decoded.type === "nprofile") {
      return decoded.data.pubkey.toLowerCase();
    }
  }

  return null;
}

async function resolvePublishAsBunkerUri(ndk: NDK, publishAs: string): Promise<string> {
  const normalized = trimNostrPrefix(publishAs.trim());

  if (!normalized) {
    throw new Error("publish_as cannot be empty.");
  }

  if (normalized.startsWith("bunker://")) {
    return normalized;
  }

  const pubkey = extractPubkeyFromInput(normalized);
  if (pubkey) {
    return buildBunkerUriFromPubkey(ndk, pubkey);
  }

  if (normalized.includes("@")) {
    const user = await NDKUser.fromNip05(normalized, ndk);
    if (!user?.pubkey) {
      throw new Error(`Failed to resolve NIP-05 in publish_as: ${publishAs}`);
    }
    return buildBunkerUriFromPubkey(ndk, user.pubkey);
  }

  throw new Error(
    "Invalid publish_as value. Use bunker:// URI, hex pubkey, npub, nprofile, or NIP-05.",
  );
}

/**
 * Creates an NDK signer based on available credentials.
 * Supports local-key signing and NIP-46 remote signing.
 * 
 * Priority:
 * 1) publishAs parameter
 * 2) NOSTR_BUNKER_KEY environment variable
 * 3) Local key signing with nsec parameter or NOSTR_PRIVATE_KEY
 *
 * For NIP-46 bunker signing, a local key is still required to authenticate
 * with the bunker (nsec parameter or NOSTR_PRIVATE_KEY environment variable).
 *
 * @param ndk - NDK instance used for NIP-46 signer initialization
 * @param options - Optional signer inputs
 * @returns NDK signer instance or null if no credentials are available
 */
export async function createSigner(ndk: NDK, options: SignerOptions = {}): Promise<NDKSigner | null> {
  const { nsec, publishAs } = options;
  const bunkerSelection = publishAs || process.env.NOSTR_BUNKER_KEY;

  if (bunkerSelection) {
    const localPrivateKey = getLocalPrivateKey(nsec);
    if (!localPrivateKey) {
      throw new Error(
        "NIP-46 signing requires a local key. Please provide nsec or set NOSTR_PRIVATE_KEY.",
      );
    }

    const bunkerConnection = await resolvePublishAsBunkerUri(ndk, bunkerSelection);
    return NDKNip46Signer.bunker(ndk, bunkerConnection, localPrivateKey);
  }

  const localPrivateKey = getLocalPrivateKey(nsec);
  if (localPrivateKey) {
    return new NDKPrivateKeySigner(localPrivateKey);
  }

  // No signing credentials available
  return null;
}

/**
 * Checks if signing credentials are available in the environment.
 * Used to determine if nsec should be a required parameter in tool schemas.
 * 
 * @returns true if environment variable contains private key
 */
export function hasEnvironmentSigner(): boolean {
  return !!process.env.NOSTR_PRIVATE_KEY;
}

/**
 * Checks if a NIP-46 bunker connection is available via environment.
 *
 * @returns true if environment variable contains bunker connection string
 */
export function hasEnvironmentBunker(): boolean {
  return !!process.env.NOSTR_BUNKER_KEY;
}

/**
 * Gets the appropriate schema for nsec parameter based on environment.
 * 
 * @returns Schema object for nsec parameter or null if not needed
 */
export function getNsecSchema() {
  if (hasEnvironmentSigner()) {
    // If env key exists, nsec is optional
    return {
      type: 'string' as const,
      description: 'Optional: Override environment key with a different nsec (Nostr private key in bech32 format)'
    };
  }
  
  // If no env key, nsec is required
  return {
    type: 'string' as const,
    description: 'The nsec (Nostr private key in bech32 format) for signing, or as local auth key for NIP-46 bunker signing'
  };
}

/**
 * Gets the schema for optionally selecting a NIP-46 bunker signer.
 * 
 * @returns Schema object for publish_as parameter
 */
export function getPublishAsSchema() {
  if (hasEnvironmentBunker()) {
    return {
      type: 'string' as const,
      description: 'Optional: Override NOSTR_BUNKER_KEY with publish target (bunker:// URI, hex pubkey, npub, nprofile, or NIP-05)'
    };
  }

  return {
    type: 'string' as const,
    description: 'Optional: Use NIP-46 remote signing target (bunker:// URI, hex pubkey, npub, nprofile, or NIP-05)'
  };
}

/**
 * Determines if nsec should be in the required fields array.
 * 
 * @returns true if nsec should be required (no env key available)
 */
export function isNsecRequired(): boolean {
  return !hasEnvironmentSigner();
}
