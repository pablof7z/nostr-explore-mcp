import { NostrTool } from "../types.js";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

interface ContentPublisherParams {
  title: string;
  content: string;
  summary?: string;
  image?: string;
  tags?: Array<Array<string>>;
  published_at?: number;
}

export const contentPublisher: NostrTool = {
  schema: {
    name: "nostr_content_publisher",
    description: "Publishes long-form content to the Nostr network using the kind:30023 standard for articles",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the article. Will be used in the 'title' tag",
        },
        content: {
          type: "string",
          description: "The full body of the article in Markdown format",
        },
        summary: {
          type: "string",
          description: "A short summary of the article. Will be used in the 'summary' tag",
        },
        image: {
          type: "string",
          description: "A URL to a header or thumbnail image. Will be used in the 'image' tag",
        },
        tags: {
          type: "array",
          items: {
            type: "array",
            items: {
              type: "string",
            },
          },
          description: "A list of additional tags, e.g., [['t', 'ai'], ['t', 'devrel']]",
        },
        published_at: {
          type: "number",
          description: "A Unix timestamp for the publication date. Will be used in the 'published_at' tag. Defaults to the current time",
        },
      },
      required: ["title", "content"],
    },
  },
  handler: async (args, ndk) => {
    const { 
      title, 
      content, 
      summary, 
      image, 
      tags = [], 
      published_at 
    } = args as ContentPublisherParams;

    // Check if private key is available
    const privateKey = process.env.NOSTR_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("NOSTR_PRIVATE_KEY environment variable is not set. Please set it to publish content.");
    }

    // Create the event
    const event = new NDKEvent(ndk);
    event.kind = 30023; // Long-form content
    event.content = content;
    
    // Add required tags
    event.tags = [
      ["title", title],
    ];

    // Add optional tags
    if (summary) {
      event.tags.push(["summary", summary]);
    }
    
    if (image) {
      event.tags.push(["image", image]);
    }
    
    if (published_at) {
      event.tags.push(["published_at", published_at.toString()]);
    } else {
      event.tags.push(["published_at", Math.floor(Date.now() / 1000).toString()]);
    }

    // Add custom tags
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        if (Array.isArray(tag) && tag.length >= 1) {
          event.tags.push(tag);
        }
      }
    }

    // Add a 'd' tag for parameterized replaceable events
    // Create a slug from the title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60); // Limit slug length
    
    event.tags.push(["d", slug]);

    // Sign and publish the event
    try {
      // Set the private key for signing
      ndk.signer = await ndk.createSigner(privateKey);
      
      await event.sign();
      await event.publish();

      // Create identifiers for the response
      const eventId = event.id;
      const noteId = nip19.noteEncode(event.id);
      const nevent = nip19.neventEncode({
        id: event.id,
        relays: ndk.explicitRelayUrls || [],
      });
      
      // Create naddr for parameterized replaceable events
      const naddr = nip19.naddrEncode({
        kind: 30023,
        pubkey: event.pubkey,
        identifier: slug,
        relays: ndk.explicitRelayUrls || [],
      });

      return {
        eventId,
        noteId,
        nevent,
        naddr,
        slug,
        published: true,
        event: {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags,
          content: event.content,
          sig: event.sig,
        },
        metadata: {
          title,
          summary: summary || undefined,
          image: image || undefined,
          published_at: event.tags.find(tag => tag[0] === "published_at")?.[1],
          custom_tags: tags.length > 0 ? tags : undefined,
        },
        urls: {
          primal: `https://primal.net/e/${noteId}`,
          nostrud: `https://nostrud.com/${naddr}`,
          habla: `https://habla.news/a/${naddr}`,
        },
      };
    } catch (error) {
      throw new Error(`Failed to publish content: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

export default contentPublisher;