import { NDKEvent } from "@nostr-dev-kit/ndk";

export class EventProcessor {
  static extractMentions(event: NDKEvent): string[] {
    return event.tags
      .filter(tag => tag[0] === "p")
      .map(tag => tag[1]);
  }

  static isRelevantEvent(event: NDKEvent, agentPubkey: string): boolean {
    const mentions = this.extractMentions(event);
    return mentions.includes(agentPubkey);
  }

  static enrichEventContext(event: NDKEvent): {
    isReply: boolean;
    isReaction: boolean;
    isMention: boolean;
    isRepost: boolean;
    threadRoot?: string;
    replyTo?: string;
  } {
    const eTags = event.tags.filter(tag => tag[0] === "e");
    const rootTag = eTags.find(tag => tag[3] === "root");
    const replyTag = eTags.find(tag => tag[3] === "reply") || eTags[eTags.length - 1];
    
    return {
      isReply: eTags.length > 0 && event.kind === 1,
      isReaction: event.kind === 7,
      isMention: event.tags.some(tag => tag[0] === "p"),
      isRepost: event.kind === 6,
      threadRoot: rootTag?.[1],
      replyTo: replyTag?.[1]
    };
  }

  static formatSummary(event: NDKEvent, agentPubkey: string): string {
    const context = this.enrichEventContext(event);
    const author = this.formatAuthor(event);
    
    if (context.isReaction) {
      const reaction = event.content || "+";
      return `${author} reacted with "${reaction}"`;
    }
    
    if (context.isRepost) {
      return `${author} reposted your note`;
    }
    
    if (context.isReply) {
      const preview = this.getContentPreview(event.content);
      return `${author} replied: ${preview}`;
    }
    
    if (context.isMention) {
      const preview = this.getContentPreview(event.content);
      return `${author} mentioned you: ${preview}`;
    }
    
    const preview = this.getContentPreview(event.content);
    return `${author} posted: ${preview}`;
  }

  private static formatAuthor(event: NDKEvent): string {
    const profile = event.author?.profile;
    if (profile?.name) return profile.name;
    if (profile?.display_name) return profile.display_name;
    return `${event.pubkey.substring(0, 8)}...`;
  }

  private static getContentPreview(content: string | number, maxLength: number = 100): string {
    if (!content) return "[no content]";
    
    const contentStr = typeof content === 'string' ? content : String(content);
    const cleaned = contentStr
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (cleaned.length <= maxLength) return `"${cleaned}"`;
    return `"${cleaned.substring(0, maxLength)}..."`;
  }

  static categorizeEvent(event: NDKEvent): {
    category: "mention" | "reply" | "reaction" | "repost" | "other";
    priority: "high" | "medium" | "low";
  } {
    const context = this.enrichEventContext(event);
    
    if (context.isMention && event.kind === 1) {
      return { category: "mention", priority: "high" };
    }
    
    if (context.isReply) {
      return { category: "reply", priority: "high" };
    }
    
    if (context.isReaction) {
      return { category: "reaction", priority: "medium" };
    }
    
    if (context.isRepost) {
      return { category: "repost", priority: "medium" };
    }
    
    return { category: "other", priority: "low" };
  }
}