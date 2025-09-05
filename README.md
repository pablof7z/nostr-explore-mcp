# Nostr Explore MCP

A Model Context Protocol (MCP) server that enables AI assistants to explore and interact with the Nostr network, focusing on conversation discovery, content publishing, and notification monitoring.

## Version 0.2.0 Changes
- Renamed `nostr_tweet_publisher` to `nostr_note_publisher` for better clarity
- Added flexible authentication: tools now support both environment variable (`NOSTR_PRIVATE_KEY`) and direct nsec parameter
- Improved code organization with shared signer utility for DRY principle

## What You Can Do

This MCP server provides tools for:

### Conversation Exploration
- **Track conversations** - Search and retrieve conversation threads based on keywords or hashtags
- **Get full thread context** - Retrieve complete conversation threads from any event, including all parent messages
- **Monitor discussions** - Find active discussions about specific topics with configurable depth

### Content Publishing  
- **Publish short notes** - Post Twitter-style messages with hashtags, mentions, and replies
- **Create long-form articles** - Publish full articles with markdown, summaries, and header images
- **View user timelines** - Get all root posts from specific Nostr users

### Notification Management
- **Monitor mentions** - Track when specific pubkeys are mentioned across the network
- **Store notifications** - Retrieve and manage notifications for monitored agents
- **Publish notification events** - Create notification events based on source events

## Installation

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/nostr-mcp-server.git
cd nostr-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Configure your MCP client (e.g., Claude Desktop) to use the server by adding to your configuration:
```json
{
  "mcpServers": {
    "nostr-explore": {
      "command": "node",
      "args": ["path/to/dist/index.js"]
    }
  }
}
```

## Configuration

The server connects to the following Nostr relays by default:
- wss://relay.primal.net
- wss://tenex.chat

### Authentication for Publishing

You can provide signing credentials in two ways:

1. **Environment Variable (Recommended for single-user setups):**
   Set `NOSTR_PRIVATE_KEY` in your environment with your private key (hex or nsec format).
   When set, the nsec parameter becomes optional in publishing tools.

2. **Direct Parameter:**
   Pass the `nsec` parameter directly to publishing tools. This takes precedence over the environment variable.

## Usage

Once configured, the MCP server provides tools that can be accessed by AI assistants:

### Examples

**Publishing a short note:**
```typescript
// With nsec parameter
await nostr_note_publisher({
  content: "Hello Nostr!",
  nsec: "your-nsec-key",  // Optional if NOSTR_PRIVATE_KEY is set
  hashtags: ["introductions"],
  mentions: ["npub1..."]
});

// With environment variable set (no nsec needed)
await nostr_note_publisher({
  content: "Hello Nostr!",
  hashtags: ["introductions"],
  mentions: ["npub1..."]
});
```

**Publishing long-form content:**
```typescript
// With nsec parameter
await nostr_content_publisher({
  title: "Understanding Nostr",
  content: "Full article content in markdown...",
  summary: "An introduction to Nostr",
  image: "https://example.com/header.jpg",
  tags: [["t", "nostr"], ["t", "decentralization"]],
  nsec: "your-nsec-key"  // Optional if NOSTR_PRIVATE_KEY is set
});

// With environment variable set (no nsec needed)
await nostr_content_publisher({
  title: "Understanding Nostr",
  content: "Full article content in markdown...",
  summary: "An introduction to Nostr",
  image: "https://example.com/header.jpg",
  tags: [["t", "nostr"], ["t", "decentralization"]]
});
```

**Searching for conversations:**
```typescript
await nostr_conversation_tracker({
  query: "#bitcoin",
  limit: 10,
  thread_depth: 2
});
```

**Getting a full conversation thread:**
```typescript
await get_conversation({
  eventId: "nevent1..." // or hex event ID
});
```

## Available Tools

The server provides the following tools:

### Conversation Tools
- `get_conversation` - Retrieve a full conversation thread from any Nostr event
- `nostr_conversation_tracker` - Search and retrieve conversation threads by keywords/hashtags
- `user_root_notes` - Get all root posts from a specific user

### Publishing Tools
- `nostr_note_publisher` - Publish short notes with hashtags, mentions, and replies
- `nostr_content_publisher` - Publish long-form articles with markdown support

### Notification Tools
- `start_notification_monitoring` - Start monitoring mentions for a specific pubkey
- `stop_notification_monitoring` - Stop monitoring for a specific pubkey
- `get_notifications` - Retrieve stored notifications
- `publish_notification` - Create and publish notification events

## Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test
```

### Project Structure
```
nostr-explore-mcp/
├── src/
│   ├── index.ts                    # Main server entry point
│   ├── tools/                      # Tool implementations
│   │   ├── getConversation.ts      # Conversation retrieval
│   │   ├── nostr/
│   │   │   ├── conversationTracker.ts # Conversation search
│   │   │   └── contentPublisher.ts    # Long-form publishing
│   │   ├── nostrNotePublisher.ts   # Short note publishing
│   │   ├── notifications.ts        # Notification management
│   │   └── userRootNotes.ts        # User timeline
│   └── utils/                      # Shared utilities
│       └── signer.ts               # Shared signing logic
├── dist/                           # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Resources

- [Nostr Protocol Documentation](https://github.com/nostr-protocol/nostr)
- [NIPs (Nostr Implementation Possibilities)](https://github.com/nostr-protocol/nips)
- [MCP Documentation](https://modelcontextprotocol.io)

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

## Authors

[@pablof7z](nostr:npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft)
