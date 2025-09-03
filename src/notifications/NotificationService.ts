import NDK, { NDKEvent, NDKSubscription, NDKFilter } from "@nostr-dev-kit/ndk";
import { NotificationEvent, NotificationConfig, NotificationFilter } from "./types.js";
import { NotificationStorage } from "./NotificationStorage.js";
import { buildNotificationEvent } from "./NotificationBuilder.js";

export class NotificationService {
  private ndk: NDK;
  private agentPubkey: string;
  private subscription: NDKSubscription | null = null;
  private storage: NotificationStorage;
  private eventCount: number = 0;
  private startTime: number = 0;

  constructor(ndk: NDK, agentPubkey: string, maxStorageSize: number = 1000) {
    this.ndk = ndk;
    this.agentPubkey = agentPubkey;
    this.storage = new NotificationStorage(maxStorageSize);
  }

  async startMonitoring(): Promise<void> {
    if (this.subscription) {
      throw new Error("Monitoring already active for this agent");
    }

    this.startTime = Math.floor(Date.now() / 1000);
    
    const filter: NDKFilter = {
      "#p": [this.agentPubkey],
      since: this.startTime
    };

    this.subscription = this.ndk.subscribe(filter, { closeOnEose: false });
    
    this.subscription.on("event", (event: NDKEvent) => {
      this.handleIncomingEvent(event);
    });

    console.error(`Started monitoring for agent: ${this.agentPubkey}`);
  }

  stopMonitoring(): void {
    if (this.subscription) {
      this.subscription.stop();
      this.subscription = null;
      console.error(`Stopped monitoring for agent: ${this.agentPubkey}`);
    }
  }

  private handleIncomingEvent(event: NDKEvent): void {
    try {
      this.eventCount++;
      const notification = this.createNotification(event);
      this.storage.store(notification);
      console.error(`Processed event ${event.id} - Total events: ${this.eventCount}`);
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error);
    }
  }

  private createNotification(sourceEvent: NDKEvent): NotificationEvent {
    return buildNotificationEvent(sourceEvent, this.agentPubkey);
  }

  getNotifications(filters?: NotificationFilter): NotificationEvent[] {
    return this.storage.retrieve(filters);
  }

  clearNotifications(): void {
    this.storage.clear();
    this.eventCount = 0;
  }

  getStatus(): {
    isActive: boolean;
    agentPubkey: string;
    eventCount: number;
    startTime: number;
    storageSize: number;
  } {
    return {
      isActive: this.subscription !== null,
      agentPubkey: this.agentPubkey,
      eventCount: this.eventCount,
      startTime: this.startTime,
      storageSize: this.storage.size()
    };
  }

  isMonitoring(): boolean {
    return this.subscription !== null;
  }
}