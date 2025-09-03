import { NDKEvent } from "@nostr-dev-kit/ndk";
import { NotificationEvent, NotificationMetadata } from "./types.js";

export function buildNotificationEvent(
  sourceEvent: NDKEvent,
  agentPubkey: string
): NotificationEvent {
  const metadata = extractEventMetadata(sourceEvent);
  const dTag = generateDTag(sourceEvent.id, agentPubkey);
  
  return {
    pubkey: agentPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1616,
    tags: [
      ["e", metadata.sourceEventId],
      ["p", metadata.sourceAuthorPubkey],
      ["k", metadata.sourceEventKind.toString()],
      ["d", dTag]
    ],
    content: metadata.summary
  };
}

export function extractEventMetadata(event: NDKEvent): NotificationMetadata {
  return {
    sourceEventId: event.id || "",
    sourceAuthorPubkey: event.pubkey,
    sourceEventKind: event.kind || 0,
    timestamp: event.created_at || Math.floor(Date.now() / 1000),
    summary: generateEventSummary(event)
  };
}

function generateEventSummary(event: NDKEvent): string {
  const kindDescriptions: Record<number, string> = {
    0: "profile metadata update",
    1: "text note",
    3: "contact list update",
    4: "encrypted direct message",
    5: "event deletion request",
    6: "repost",
    7: "reaction",
    40: "channel creation",
    41: "channel metadata",
    42: "channel message",
    1984: "report",
    9735: "zap receipt",
    10002: "relay list",
    30023: "long-form content"
  };
  
  const eventType = kindDescriptions[event.kind || 1] || `kind ${event.kind} event`;
  const author = event.author?.profile?.name || event.author?.profile?.display_name || `${event.pubkey.substring(0, 8)}...`;
  
  const contentPreview = event.content ? 
    event.content.substring(0, 100) + (event.content.length > 100 ? "..." : "") : 
    "";
  
  const hasMention = event.tags.some(tag => tag[0] === "p" && tag[1] === event.pubkey);
  const action = hasMention ? "mentioned you in" : "created";
  
  return `${author} ${action} a ${eventType}${contentPreview ? `: "${contentPreview}"` : ""}`;
}

function generateDTag(sourceEventId: string, agentPubkey: string): string {
  return `notification-${sourceEventId}-${agentPubkey.substring(0, 8)}`;
}