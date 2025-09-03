import { NotificationEvent, NotificationFilter } from "./types.js";

export class NotificationStorage {
  private notifications: Map<string, NotificationEvent> = new Map();
  private readonly maxSize: number;
  private notificationOrder: string[] = [];

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  store(notification: NotificationEvent): void {
    const key = this.generateKey(notification);
    
    if (!this.notifications.has(key)) {
      this.notificationOrder.push(key);
    }
    
    this.notifications.set(key, notification);
    this.prune();
  }

  retrieve(filters: NotificationFilter = {}): NotificationEvent[] {
    let results = Array.from(this.notifications.values());
    
    if (filters.since) {
      results = results.filter(n => n.created_at >= filters.since!);
    }
    
    if (filters.until) {
      results = results.filter(n => n.created_at <= filters.until!);
    }
    
    results.sort((a, b) => b.created_at - a.created_at);
    
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }
    
    return results;
  }

  clear(): void {
    this.notifications.clear();
    this.notificationOrder = [];
  }

  size(): number {
    return this.notifications.size;
  }

  private prune(): void {
    while (this.notificationOrder.length > this.maxSize) {
      const oldestKey = this.notificationOrder.shift();
      if (oldestKey) {
        this.notifications.delete(oldestKey);
      }
    }
  }

  private generateKey(notification: NotificationEvent): string {
    const dTag = notification.tags.find(t => t[0] === "d")?.[1];
    return dTag || `${notification.created_at}-${notification.pubkey}`;
  }

  export(): NotificationEvent[] {
    return Array.from(this.notifications.values());
  }
}