import NDK, { NDKUser } from "@nostr-dev-kit/ndk";

/**
 * Resolves a user identifier to an NDKUser instance
 * Supports: NIP-05, npub, nprofile, and hex pubkey
 *
 * @param userIdentifier - NIP-05 (user@domain.com), npub, nprofile, or hex pubkey
 * @param ndk - NDK instance
 * @returns NDKUser instance
 * @throws Error if the identifier is invalid or user cannot be resolved
 */
export async function resolveUser(userIdentifier: string, ndk: NDK): Promise<NDKUser> {
  // Check if it's a NIP-05 identifier (contains @)
  if (userIdentifier.includes('@')) {
    const user = await ndk.getUserFromNip05(userIdentifier);
    if (!user) {
      throw new Error(`Failed to resolve NIP-05 identifier: ${userIdentifier}`);
    }
    return user;
  }

  // Handle npub, nprofile, or hex pubkey using getUser (synchronous)
  const user = ndk.getUser({ pubkey: userIdentifier });

  if (!user || !user.pubkey) {
    throw new Error(`Invalid user identifier: ${userIdentifier}`);
  }

  return user;
}
