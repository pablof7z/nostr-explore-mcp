import NDK from "@nostr-dev-kit/ndk";
import { NotificationService } from "./NotificationService.js";
import { ActiveSubscription } from "./types.js";

export class SubscriptionManager {
  private services: Map<string, NotificationService> = new Map();
  private ndk: NDK;

  constructor(ndk: NDK) {
    this.ndk = ndk;
  }

  async addSubscription(agentPubkey: string): Promise<void> {
    if (this.services.has(agentPubkey)) {
      throw new Error(`Already monitoring agent: ${agentPubkey}`);
    }

    const service = new NotificationService(this.ndk, agentPubkey);
    await service.startMonitoring();
    this.services.set(agentPubkey, service);
  }

  removeSubscription(agentPubkey: string): boolean {
    const service = this.services.get(agentPubkey);
    if (service) {
      service.stopMonitoring();
      this.services.delete(agentPubkey);
      return true;
    }
    return false;
  }

  getService(agentPubkey: string): NotificationService | undefined {
    return this.services.get(agentPubkey);
  }

  getActiveSubscriptions(): ActiveSubscription[] {
    const subscriptions: ActiveSubscription[] = [];
    
    for (const [pubkey, service] of this.services.entries()) {
      const status = service.getStatus();
      if (status.isActive) {
        subscriptions.push({
          agentPubkey: pubkey,
          subscription: null as any,
          startedAt: status.startTime,
          eventCount: status.eventCount
        });
      }
    }
    
    return subscriptions;
  }

  stopAll(): void {
    for (const service of this.services.values()) {
      service.stopMonitoring();
    }
    this.services.clear();
  }

  async handleReconnection(): Promise<void> {
    const currentServices = Array.from(this.services.entries());
    this.services.clear();
    
    for (const [pubkey, oldService] of currentServices) {
      if (oldService.isMonitoring()) {
        const newService = new NotificationService(this.ndk, pubkey);
        await newService.startMonitoring();
        this.services.set(pubkey, newService);
      }
    }
  }

  getActiveCount(): number {
    return this.services.size;
  }
}