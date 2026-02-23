# Nostr Explore MCP

## Project Definition

Nostr Explore MCP is a command-line tool that operates as a Model Context Protocol (MCP) server. Its purpose is to provide tools for exploring and querying data from the Nostr network.

## Distribution Requirements

- Must be publishable and distributable via npm
- Must be executable directly using: `npx -y nostr-explore-mcp`
- Must function as a standalone command-line tool

## Nostr Network Integration Requirements

### Relay Connections
The server must establish connections to these specific Nostr relays on startup:
- `relay.primal.net`  
- `wss://tenex.chat`

### Connection Behavior
- Must initiate relay connections using the equivalent of NDK's `connect()` method
- Must maintain persistent connections to these relays for the duration of the server's operation

## MCP Server Requirements

The tool must implement the Model Context Protocol server specification to:
- Accept and respond to MCP client requests
- Provide tool definitions and execute tool calls
- Handle standard MCP server lifecycle (initialization, tool listing, tool execution)

## Required Tools

### user_root_notes(userId)

**Purpose**: Retrieve all primary, top-level text notes from a specified Nostr user

**Input Parameter**:
- `userId` (string): User identifier in either format:
  - npub format (e.g., `npub1...`)
  - hex public key format

**Processing Logic**:
1. Convert user identifier to appropriate format for Nostr queries
2. Query for events of `kind:1` (standard text notes) from the specified user
3. Filter results to exclude any notes containing an `e` tag
4. Return only "root notes" (original posts, not replies or references)

**Output**: Collection of the user's original text notes, excluding replies and references

### get_conversation(eventId)

**Purpose**: Retrieve a complete conversation thread from a Nostr event, reconstructing the full conversation path from root to the specified event

**Input Parameter**:
- `eventId` (string): Event identifier in either format:
  - bech32 format (nevent, note)
  - hex event ID

**Processing Logic**:
1. Fetch the requested event
2. Identify the root event through e-tag analysis (supporting both marked tags and positional formats)
3. Fetch all events that reference the root to build the complete thread
4. Reconstruct the conversation path from root to requested event
5. Fetch user profiles for all participants
6. Resolve embedded content in messages
7. Format as structured markdown with proper threading indentation

**Output**: Complete conversation thread formatted as markdown, including participant profiles, timestamps, and thread metadata

### Notification Management Tools

#### start_notification_monitoring(agentPubkey)

**Purpose**: Begin monitoring Nostr events that mention a specific agent's public key

**Input Parameter**:
- `agentPubkey` (string): The public key of the agent to monitor mentions for

**Output**: Confirmation of monitoring activation with timestamp

#### stop_notification_monitoring(agentPubkey)

**Purpose**: Stop monitoring Nostr events for a specific agent

**Input Parameter**:
- `agentPubkey` (string): The public key of the agent to stop monitoring

**Output**: Confirmation of monitoring deactivation

#### get_notifications(agentPubkey, limit?, since?)

**Purpose**: Retrieve stored notifications for a monitored agent

**Input Parameters**:
- `agentPubkey` (string): The public key of the agent to get notifications for
- `limit` (number, optional): Maximum number of notifications to return (default: 50)
- `since` (number, optional): Unix timestamp to get notifications after

**Output**: Collection of notifications with metadata including status information

#### get_active_subscriptions()

**Purpose**: List all currently active notification monitoring subscriptions

**Output**: Array of active subscriptions with their status information

## Data Filtering Rules

**Root Notes Definition**: 
- Must be `kind:1` events (standard text notes)
- Must NOT contain an `e` tag (which indicates replies or references to other events)
- Must be authored by the specified user

**Conversation Threading**:
- Support both NIP-10 marked tags (`root`, `reply`) and legacy positional e-tag formats
- Handle thread reconstruction through parent-child relationships
- Resolve content embeddings (nostr: references, mentions)

**Notification Processing**:
- Monitor events mentioning agent public keys
- Maintain persistent storage of notifications for retrieval

## User Experience Requirements

**Command Execution**:
- User runs: `npx -y nostr-explore-mcp`
- Tool starts as MCP server
- Tool connects to specified relays
- Tool becomes available for MCP client tool calls

**Tool Usage**:
- MCP clients can discover and call all available tools
- Tool executes queries against connected Nostr relays
- Results are returned to the MCP client in appropriate format

## Technical Constraints

- Must implement proper Nostr event filtering and querying
- Must handle both npub/hex public key and nevent/note/hex event ID formats
- Must maintain reliable connections to specified Nostr relays
- Must conform to MCP server protocol specifications
- Must handle errors gracefully (network failures, invalid IDs, etc.)
- Must support persistent notification monitoring across sessions

## Success Criteria

A successful implementation will:
1. Start as an MCP server when executed via npx
2. Connect to the specified Nostr relays
3. Respond to MCP tool discovery requests
4. Execute all tools correctly with proper error handling
5. Return accurate, filtered results for all query types
6. Handle various ID formats appropriately
7. Maintain persistent notification monitoring
