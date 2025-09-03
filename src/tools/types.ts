import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import NDK from "@nostr-dev-kit/ndk";

export interface NostrTool {
  schema: ToolSchema;
  handler: (args: any, ndk: NDK) => Promise<any>;
}