import { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

/**
 * Creates an NDK signer based on available credentials.
 * Prioritizes environment variable if available, falls back to provided nsec.
 * 
 * @param nsec - Optional nsec (bech32 encoded private key) provided by the user
 * @returns NDKPrivateKeySigner instance or null if no credentials available
 */
export function createSigner(nsec?: string): NDKPrivateKeySigner | null {
  // Priority 1: Environment variable
  const envPrivateKey = process.env.NOSTR_PRIVATE_KEY;
  if (envPrivateKey) {
    return new NDKPrivateKeySigner(envPrivateKey);
  }

  // Priority 2: Provided nsec parameter
  if (nsec) {
    return new NDKPrivateKeySigner(nsec);
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
    description: 'The nsec (Nostr private key in bech32 format) for signing the event'
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