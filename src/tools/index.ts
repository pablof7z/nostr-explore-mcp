import { getConversationTool } from "./getConversation.js";
import { 
    startNotificationMonitoringTool,
    stopNotificationMonitoringTool,
    getNotificationsTool,
    publishNotificationTool,
    initializeSubscriptionManager 
} from "./notifications.js";
import { userRootNotesTool } from "./userRootNotes.js";
import { NostrTool } from "./types.js";
import { conversationTracker } from './nostr/conversationTracker.js';
import { contentPublisher } from './nostr/contentPublisher.js';
import { nostrTweetPublisher } from './nostrTweetPublisher.js';

const tools: NostrTool[] = [
    getConversationTool,
    startNotificationMonitoringTool,
    stopNotificationMonitoringTool,
    getNotificationsTool,
    publishNotificationTool,
    userRootNotesTool,
    conversationTracker,
    contentPublisher,
    nostrTweetPublisher
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
    getNotificationsTool,
    publishNotificationTool,
    userRootNotesTool,
    conversationTracker,
    contentPublisher,
    nostrTweetPublisher,
    initializeSubscriptionManager
}