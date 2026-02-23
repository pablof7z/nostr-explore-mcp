import { NostrTool } from "../types.js";
import { NDKArticle } from "@nostr-dev-kit/ndk";
import {
  createSigner,
  getNsecSchema,
  getPublishAsSchema,
  isNsecRequired,
} from "../../utils/signer.js";

interface ContentPublisherParams {
  title: string;
  content: string;
  summary?: string;
  image?: string;
  tags?: Array<Array<string>>;
  published_at?: number;
  nsec?: string;
  publish_as?: string;
}

export const publishArticle: NostrTool = {
  schema: {
    name: "nostr_publish_article",
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
        ...(getNsecSchema() ? { nsec: getNsecSchema() } : {}),
        publish_as: getPublishAsSchema(),
      },
      required: ["title", "content", ...(isNsecRequired() ? ["nsec"] : [])],
    },
  },
  handler: async (args, ndk) => {
    const { 
      title, 
      content, 
      summary, 
      image, 
      tags = [], 
      published_at,
      nsec,
      publish_as,
    } = args as ContentPublisherParams;

    // Create signer using utility function
    const signer = await createSigner(ndk, {
      nsec,
      publishAs: publish_as,
    });
    if (!signer) {
      throw new Error("No signing credentials available. Please provide nsec, set NOSTR_PRIVATE_KEY, or configure NOSTR_BUNKER_KEY/publish_as.");
    }

    // Create the event
    const event = new NDKArticle(ndk);
    event.content = content;
    
    // Add required tags
    event.title = title;

    // Add optional tags
    if (summary) {
      event.summary = summary;
    }
    
    if (image) {
      event.image = image;
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

    // Sign and publish the event
    try {
      await event.sign(signer);
      const relaySet = await event.publish();
      const relays = [...relaySet].map(r => r.url);
      const result = { naddr: event.encode(), relays };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      throw new Error(`Failed to publish content: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

export default publishArticle;
