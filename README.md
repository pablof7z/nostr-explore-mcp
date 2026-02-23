# Nostr Explore MCP

A Model Context Protocol (MCP) server that enables AI assistants to explore and interact with the Nostr network — conversation discovery, content publishing, and real-time event subscriptions.

## What You Can Do

### Conversation Exploration
- **Track conversations** — Search and retrieve threads by keywords or hashtags
- **Get full thread context** — Retrieve complete conversation threads from any event, including all parents

### Content Publishing
- **Publish short notes** — Post kind:1 messages with hashtags, mentions, and replies
- **Create long-form articles** — Publish kind:30023 articles with markdown, summaries, and header images
- **Publish raw events** — Sign and publish any arbitrary Nostr event

### Real-time Resource Subscriptions
All resources support MCP `resources/subscribe` — the client receives a push notification whenever a new event arrives, without polling.

- **User notes** — Live stream of root notes from a specific user
- **Notifications** — Live stream of events that mention a specific pubkey
- **Event feed** — Live stream of all events from a user, optionally filtered by kind

## Installation

```bash
npx nostr-explore-mcp
```

Or add to your MCP client config (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "nostr-explore": {
      "command": "npx",
      "args": ["nostr-explore-mcp"]
    }
  }
}
```

## Configuration

Default relays:
- `wss://relay.primal.net`
- `wss://tenex.chat`

### Authentication for Publishing

Publishing requires a signing key. Three ways to provide one:

1. **Environment variable** — set `NOSTR_PRIVATE_KEY` (hex or nsec)
2. **Per-call parameter** — pass `nsec` in the tool arguments
3. **NIP-46 bunker** — set `NOSTR_BUNKER_KEY` (bunker URL, hex pubkey, npub, or NIP-05), or pass `publish_as` per call

NIP-46 still needs a local key for bunker authentication (`nsec` param or `NOSTR_PRIVATE_KEY`).

Precedence: `publish_as` > `NOSTR_BUNKER_KEY`, `nsec` > `NOSTR_PRIVATE_KEY`.

## Available Tools

### Conversation

| Tool | Description |
|------|-------------|
| `get_conversation` | Retrieve a full thread from any Nostr event (nevent, hex ID, etc.) |
| `nostr_conversation_tracker` | Search threads by keyword or hashtag |

### Publishing

All publish tools return the encoded event ID **and** the list of relays where the event was accepted.

| Tool | Returns | Description |
|------|---------|-------------|
| `nostr_publish_note` | `{ nevent, relays }` | Publish a short kind:1 note |
| `nostr_publish_article` | `{ naddr, relays }` | Publish a long-form kind:30023 article |
| `nostr_publish_raw` | `{ nevent1, relays }` | Sign and publish a raw event JSON |

## Available Resources

All resources support `resources/subscribe` for push-based update notifications.

### `nostr://user/{userId}/notes`

Root notes (kind:1 without `e` tags) from a specific user.

- `userId` — NIP-05, npub, nprofile, or hex pubkey
- `?limit=N` — max events to return (default 100)
- `?resolveContent=true` — resolve embedded `nostr:` references

### `nostr://notifications/{userId}`

Events that mention a specific user (events with a `p` tag pointing to their pubkey).

- `userId` — NIP-05, npub, nprofile, or hex pubkey
- `?limit=N` — max events to return (default 50)
- `?since=<unix>` — only events after this timestamp

### `nostr://feed/{userId}/{kinds}`

All events from a user, optionally filtered by kind.

- `userId` — NIP-05, npub, nprofile, or hex pubkey
- `{kinds}` — optional comma-separated kinds, e.g. `1,30023`
- `?relays=wss://...` — override default relays

## Development

```bash
bun run dev    # run from source
bun run build  # compile to dist/
```

### Project Structure

```
src/
├── index.ts                        # Server entry point
├── resources/
│   ├── feed.ts                     # nostr://feed/ resource
│   ├── userNotes.ts                # nostr://user/{userId}/notes resource
│   ├── notifications.ts            # nostr://notifications/{userId} resource
│   └── subscriptionManager.ts      # Live NDK subscriptions for all resources
├── tools/
│   ├── getConversation.ts
│   ├── nostrNotePublisher.ts
│   ├── nostr/
│   │   ├── conversationTracker.ts
│   │   ├── contentPublisher.ts
│   │   └── rawPublish.ts
│   └── utils/
│       └── contentResolver.ts
└── utils/
    ├── signer.ts                   # Signing / NIP-46 logic
    └── userResolver.ts             # NIP-05 / npub / hex resolution
```

## License

MIT — [@pablof7z](nostr:npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft)
