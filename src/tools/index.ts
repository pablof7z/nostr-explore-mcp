import { getConversationTool } from "./getConversation.js";
import {
    startNotificationMonitoringTool,
    stopNotificationMonitoringTool,
    publishNotificationTool,
    initializeSubscriptionManager
} from "./notifications.js";
import { NostrTool } from "./types.js";
import { conversationTracker } from './nostr/conversationTracker.js';
import { publishArticle } from './nostr/contentPublisher.js';
import { publishNote } from './nostrNotePublisher.js';
import { publishRaw } from './nostr/rawPublish.js';

const tools: NostrTool[] = [
    getConversationTool,
    startNotificationMonitoringTool,
    stopNotificationMonitoringTool,
    publishNotificationTool,
    conversationTracker,
    publishArticle,
    publishNote,
    publishRaw
];

// Helper function to get tool by name
export function getToolByName(name: string): NostrTool | undefined {
    return tools.find(tool => tool.schema.name === name);
}

export {
    tools,
    getConversationTool,
    startNotificationMonitoringTool,
    stopNotificationMonitoringTool,
    publishNotificationTool,
    conversationTracker,
    publishArticle,
    publishNote,
    publishRaw,
    initializeSubscriptionManager
}