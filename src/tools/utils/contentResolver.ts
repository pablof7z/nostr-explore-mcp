import NDK, { NDKEvent, NDKUser, NDKFilter } from "@nostr-dev-kit/ndk";

interface ResolveOptions {
  maxDepth?: number;
  currentDepth?: number;
  timeout?: number;
}

interface ResolutionError {
  entity: string;
  error: string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

async function fetchUserProfile(pubkey: string, ndk: NDK, timeout: number): Promise<{ name: string; profile: any }> {
  const filter: NDKFilter = {
    kinds: [0],
    authors: [pubkey],
    limit: 1
  };
  
  try {
    const events = await withTimeout(
      ndk.fetchEvents(filter),
      timeout,
      `Timeout fetching profile for ${pubkey}`
    );
    const profileEvent = Array.from(events)[0];
    
    if (profileEvent) {
      try {
        const content = JSON.parse(profileEvent.content);
        const name = content.display_name || content.name || new NDKUser({ pubkey }).npub.slice(0, 12) + "...";
        return { name, profile: content };
      } catch {
        // Invalid JSON
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Timeout')) {
      throw error;
    }
    // Other errors, fall through to default
  }
  
  // Fallback to truncated npub
  const user = new NDKUser({ pubkey });
  return { name: user.npub.slice(0, 12) + "...", profile: null };
}

function formatTimestamp(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleString();
}

export async function resolveNostrContent(
  content: string, 
  ndk: NDK, 
  options: ResolveOptions = {}
): Promise<string> {
  const { maxDepth = 2, currentDepth = 0, timeout = 10000 } = options;
  
  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return content;
  }
  
  // Find all nostr: references
  const nostrRegex = /nostr:(\w+)/g;
  const matches = Array.from(content.matchAll(nostrRegex));
  
  if (matches.length === 0) {
    return content;
  }
  
  // Process each match
  const replacements = new Map<string, string>();
  const profileCache = new Map<string, { name: string; profile: any }>();
  const errors: ResolutionError[] = [];
  
  for (const match of matches) {
    const fullMatch = match[0]; // e.g., "nostr:npub1..."
    const entity = match[1]; // just the entity part after "nostr:"
    
    // Skip if we've already processed this entity
    if (replacements.has(fullMatch)) {
      continue;
    }
    
    try {
      // First, try to determine if this is a user reference
      if (entity.startsWith("npub") || entity.startsWith("nprofile")) {
        // Handle user references
        let user: NDKUser;
        
        if (entity.startsWith("npub")) {
          user = new NDKUser({ npub: fullMatch.replace("nostr:", "") });
        } else {
          // For nprofile, we need to decode it properly
          // NDK should handle this when we pass the full nostr: URI
          const profileData = await withTimeout(
            ndk.fetchEvent(fullMatch),
            timeout,
            `Timeout fetching event for ${fullMatch}`
          );
          if (profileData && profileData.pubkey) {
            user = new NDKUser({ pubkey: profileData.pubkey });
          } else {
            // Try creating user directly from the entity
            user = new NDKUser({ npub: entity });
          }
        }
        
        if (user.pubkey) {
          // Check cache first
          let userInfo = profileCache.get(user.pubkey);
          if (!userInfo) {
            try {
              userInfo = await fetchUserProfile(user.pubkey, ndk, timeout);
              profileCache.set(user.pubkey, userInfo);
            } catch (error) {
              if (error instanceof Error && error.message.includes('Timeout')) {
                errors.push({
                  entity: fullMatch,
                  error: `Timeout resolving profile for ${fullMatch}`
                });
                // Leave original reference
                continue;
              }
              throw error;
            }
          }
          replacements.set(fullMatch, `@${userInfo.name}`);
        }
      } else {
        // Try to fetch as an event (nevent, note, naddr, etc.)
        const event = await withTimeout(
          ndk.fetchEvent(fullMatch),
          timeout,
          `Timeout fetching event ${fullMatch}`
        );
        
        if (event) {
          // Get author info
          let authorInfo = profileCache.get(event.pubkey);
          if (!authorInfo) {
            try {
              authorInfo = await fetchUserProfile(event.pubkey, ndk, timeout);
              profileCache.set(event.pubkey, authorInfo);
            } catch (error) {
              if (error instanceof Error && error.message.includes('Timeout')) {
                // Use fallback for author name
                const user = new NDKUser({ pubkey: event.pubkey });
                authorInfo = { name: user.npub.slice(0, 12) + "...", profile: null };
                errors.push({
                  entity: fullMatch,
                  error: `Timeout resolving author profile for embedded event`
                });
              } else {
                throw error;
              }
            }
          }
          
          // Recursively resolve the event's content
          const resolvedEventContent = await resolveNostrContent(
            event.content, 
            ndk, 
            { maxDepth, currentDepth: currentDepth + 1, timeout }
          );
          
          // Format as embedded event
          const timestamp = formatTimestamp(event.created_at!);
          const embeddedContent = [
            `<embedded-event id="${fullMatch}">`,
            `**${authorInfo.name}** • ${timestamp}`,
            resolvedEventContent,
            `</embedded-event>`
          ].join('\n');
          
          replacements.set(fullMatch, embeddedContent);
        } else {
          // If we can't resolve it, leave it as is
          errors.push({
            entity: fullMatch,
            error: `Could not fetch event ${fullMatch}`
          });
        }
      }
    } catch (error) {
      // Handle timeouts and other errors
      if (error instanceof Error && error.message.includes('Timeout')) {
        errors.push({
          entity: fullMatch,
          error: error.message
        });
      } else {
        errors.push({
          entity: fullMatch,
          error: `Error resolving ${fullMatch}: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      console.error(`Error resolving ${fullMatch}:`, error);
    }
  }
  
  // Apply all replacements
  let resolvedContent = content;
  for (const [original, replacement] of replacements) {
    resolvedContent = resolvedContent.replaceAll(original, replacement);
  }
  
  // Add debug information if there were errors
  if (errors.length > 0 && currentDepth === 0) {
    resolvedContent += "\n\n<debug>\n";
    for (const error of errors) {
      resolvedContent += `* ${error.error}\n`;
    }
    resolvedContent += "</debug>";
  }
  
  return resolvedContent;
}