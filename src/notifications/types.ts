import { NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";

export interface NotificationConfig {
  agentPubkey: string;
  monitoringSince: number;
  relays?: string[];
}

export interface NotificationEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: 1616;
  tags: string[][];
  content: string;
  sig?: string;
}

export interface NotificationFilter {
  since?: number;
  until?: number;
  limit?: number;
}

export interface NotificationMetadata {
  sourceEventId: string;
  sourceAuthorPubkey: string;
  sourceEventKind: number;
  timestamp: number;
  summary: string;
}

export interface ActiveSubscription {
  agentPubkey: string;
  subscription: NDKSubscription;
  startedAt: number;
  eventCount: number;
}