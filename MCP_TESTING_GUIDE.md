# Comprehensive Guide to MCP (Model Context Protocol) Testing

This guide provides detailed information about programmatic testing approaches, tools, frameworks, and best practices for MCP servers and tools. It covers everything from unit testing to end-to-end testing, including available testing utilities and frameworks in the MCP ecosystem.

## Table of Contents

1. [Overview of MCP Testing](#overview-of-mcp-testing)
2. [Official MCP Testing Tools](#official-mcp-testing-tools)
3. [Testing Frameworks and SDKs](#testing-frameworks-and-sdks)
4. [Unit Testing Strategies](#unit-testing-strategies)
5. [Integration Testing Approaches](#integration-testing-approaches)
6. [End-to-End Testing Methods](#end-to-end-testing-methods)
7. [Mock MCP Servers](#mock-mcp-servers)
8. [Testing Utilities and Libraries](#testing-utilities-and-libraries)
9. [Best Practices](#best-practices)
10. [Implementation Examples](#implementation-examples)
11. [CI/CD Integration](#cicd-integration)

## Overview of MCP Testing

The Model Context Protocol (MCP) is designed to enable seamless integration between LLM applications and external data sources. Testing MCP implementations requires a multi-layered approach that covers:

- **Protocol compliance**: Ensuring adherence to MCP specifications
- **Tool functionality**: Verifying that tools work as expected
- **Integration reliability**: Testing interactions between components
- **Error handling**: Validating graceful failure scenarios
- **Performance**: Ensuring acceptable response times and resource usage

### Testing Philosophy

MCP testing follows the **Testing Pyramid** model:

- **Unit Tests (Base)**: Fast, isolated tests for individual functions/classes
- **Integration Tests (Middle)**: Test interactions between components
- **End-to-End Tests (Top)**: Full system tests from client perspective

## Official MCP Testing Tools

### 1. MCP Inspector

The **MCP Inspector** is the primary official tool for testing and debugging MCP servers.

#### Web Interface
- Interactive GUI for testing tools, resources, and prompts
- Real-time event monitoring and response inspection
- Support for multiple transport protocols (SSE, STDIO, HTTP)
- Available at: https://github.com/modelcontextprotocol/inspector

#### CLI Interface
The MCP Inspector CLI enables programmatic testing and automation:

```bash
# List all available tools
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list

# Call a specific tool with arguments
npx @modelcontextprotocol/inspector --cli node build/index.js \
  --method tools/call \
  --tool-name mytool \
  --tool-arg key=value \
  --tool-arg another=value2

# List available resources
npx @modelcontextprotocol/inspector --cli node build/index.js --method resources/list

# List available prompts
npx @modelcontextprotocol/inspector --cli node build/index.js --method prompts/list

# Connect to remote server via SSE
npx @modelcontextprotocol/inspector --cli https://my-mcp-server.example.com

# With environment variables
npx @modelcontextprotocol/inspector --cli \
  -e API_KEY=your_key -- node dist/index.js \
  --method tools/call \
  --tool-name search_tool \
  --tool-arg query="test query"
```

## Testing Frameworks and SDKs

### TypeScript SDK Testing

The official TypeScript SDK provides patterns for testing MCP servers:

#### Integration Test Example
```typescript
import { spawn } from 'child_process';
import { join } from 'path';

describe('MCP Server Integration', () => {
  it('should start server and handle basic requests', async () => {
    const serverPath = join(__dirname, '../dist/server.js');
    const server = spawn('node', [serverPath]);
    let output = '';
    
    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    
    server.stdin.write(request + '\n');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(output).toContain('typescript-mcp-server');
    server.kill();
  }, 10000);
});
```

#### Load Testing Example
```typescript
import { MCPTypeScriptServer } from '../src/server';
import { CalculatorTool } from '../src/tools/calculator';

describe('Load Testing', () => {
  it('should handle concurrent requests', async () => {
    const calculator = new CalculatorTool();
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(calculator.calculate({ expression: `${i} + ${i * 2}` }));
    }
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    
    results.forEach((result, index) => {
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(`= ${index + index * 2}`);
    });
  });
});
```

### Python SDK Testing with FastMCP

**FastMCP** is a lightweight Python framework that provides excellent testing capabilities:

#### Installation and Setup
```bash
pip install fastmcp pytest pytest-asyncio
```

#### Basic Testing Pattern
```python
import pytest
from unittest.mock import AsyncMock
from fastmcp import FastMCP, Client

# Create server instance
server = FastMCP("TestServer")

# Mocked dependency
mock_db = AsyncMock()

@server.tool
async def list_users():
    """List all users from database"""
    return await mock_db.fetch_users()

@pytest.mark.asyncio
async def test_list_users_tool():
    # Setup mock return value
    mock_db.fetch_users.return_value = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
    ]

    # Create client directly connected to server (in-memory)
    async with Client(server) as client:
        # Call the tool asynchronously
        result = await client.call_tool("list_users", {})
    
    # Assert the results
    assert len(result.data) == 2
    assert result.data[0]["name"] == "Alice"
    mock_db.fetch_users.assert_called_once()
```

#### Advanced Testing Patterns
```python
import pytest
from fastmcp import FastMCP, Client
from unittest.mock import patch, AsyncMock

@pytest.fixture
async def mcp_client():
    """Fixture providing a test client"""
    server = FastMCP("TestServer")
    
    @server.tool
    async def echo_tool(message: str) -> str:
        return f"Echo: {message}"
    
    @server.resource("test://data")
    async def test_resource():
        return "Test resource content"
    
    async with Client(server) as client:
        yield client

@pytest.mark.asyncio
async def test_tool_with_validation(mcp_client):
    """Test tool with input validation"""
    result = await mcp_client.call_tool("echo_tool", {"message": "Hello"})
    assert result.content[0].text == "Echo: Hello"

@pytest.mark.asyncio
async def test_resource_access(mcp_client):
    """Test resource reading"""
    result = await mcp_client.read_resource("test://data")
    assert "Test resource content" in result.contents[0].text

@pytest.mark.asyncio
async def test_error_handling(mcp_client):
    """Test error scenarios"""
    with pytest.raises(Exception):
        await mcp_client.call_tool("nonexistent_tool", {})
```

## Unit Testing Strategies

### Testing Individual Components

Unit tests should focus on isolated functionality:

#### Tool Logic Testing
```python
# Python example
def test_content_parser():
    """Test content parsing logic"""
    parser = ContentParser()
    result = parser.parse_nostr_event({
        "kind": 1,
        "content": "Hello world #nostr",
        "tags": [["t", "nostr"]]
    })
    
    assert result["type"] == "note"
    assert "nostr" in result["hashtags"]
    assert result["content"] == "Hello world #nostr"
```

```typescript
// TypeScript example
describe('EventProcessor', () => {
  it('should categorize events correctly', () => {
    const processor = new EventProcessor();
    const event = createMockEvent({
      kind: 1,
      tags: [['e', 'root-id', '', 'root']]
    });
    
    const result = processor.categorizeEvent(event);
    expect(result.category).toBe('reply');
  });
});
```

### Schema Validation Testing

Test that tools respect their declared schemas:

```python
@pytest.mark.asyncio
async def test_tool_schema_validation():
    """Test that tool output matches declared schema"""
    server = FastMCP("TestServer")
    
    @server.tool
    async def structured_tool(name: str) -> dict:
        return {"greeting": f"Hello {name}", "timestamp": 1234567890}
    
    async with Client(server) as client:
        result = await client.call_tool("structured_tool", {"name": "Alice"})
        
        # Verify structure
        data = result.content[0].text
        parsed = json.loads(data)
        assert "greeting" in parsed
        assert "timestamp" in parsed
        assert parsed["greeting"] == "Hello Alice"
```

## Integration Testing Approaches

### Mocking External Dependencies

Integration tests should mock external services like Nostr relays:

```python
from unittest.mock import patch, AsyncMock
import pytest

@pytest.mark.asyncio
@patch('ndk.NDK.fetchEvents')
async def test_nostr_query_integration(mock_fetch):
    """Test integration with mocked NDK"""
    # Setup mock response
    mock_event = {
        "id": "abc123",
        "kind": 1,
        "content": "Test note",
        "pubkey": "user123"
    }
    mock_fetch.return_value = [mock_event]
    
    # Test the integration
    tool = NostrQueryTool()
    result = await tool.search_notes({"query": "test"})
    
    assert len(result.events) == 1
    assert result.events[0]["content"] == "Test note"
    mock_fetch.assert_called_once()
```

### Testing Component Interactions

```typescript
describe('Notification System Integration', () => {
  it('should process events through complete pipeline', async () => {
    // Arrange: Setup mocked dependencies
    const mockNdk = createMockNdk();
    const processor = new EventProcessor();
    const storage = new NotificationStorage(100);
    const builder = new NotificationBuilder();
    
    // Act: Process an event through the pipeline
    const event = createMockEvent({ kind: 1, content: "Test" });
    const processed = processor.categorizeEvent(event);
    const notification = builder.build(processed, "agent-pubkey");
    storage.store(notification);
    
    // Assert: Verify end-to-end behavior
    const stored = storage.retrieve({ limit: 1 });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toContain("Test");
  });
});
```

## End-to-End Testing Methods

### Full Server Testing

E2E tests spawn the actual server process and communicate via JSON-RPC:

```typescript
import { spawn, ChildProcess } from 'child_process';

class MCPTestClient {
  private process: ChildProcess;

  constructor(serverPath: string, env: Record<string, string> = {}) {
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
  }

  async sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      this.process.stdout!.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      this.process.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  cleanup() {
    this.process.kill();
  }
}

describe('MCP Server E2E', () => {
  let client: MCPTestClient;

  beforeAll(() => {
    client = new MCPTestClient('./dist/server.js', {
      MOCK_MODE: 'true' // Prevent real network calls
    });
  });

  afterAll(() => {
    client.cleanup();
  });

  it('should list available tools', async () => {
    const response = await client.sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });

    expect(response.result.tools).toBeArray();
    expect(response.result.tools.length).toBeGreaterThan(0);
  });
});
```

### Python E2E Testing

```python
import subprocess
import json
import asyncio
import pytest

class MCPTestProcess:
    def __init__(self, server_module, env_vars=None):
        self.env_vars = env_vars or {}
        self.process = None
        self.server_module = server_module
    
    async def __aenter__(self):
        env = {**os.environ, **self.env_vars, 'TESTING': 'true'}
        self.process = await asyncio.create_subprocess_exec(
            'python', '-m', self.server_module,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.process:
            self.process.terminate()
            await self.process.wait()
    
    async def send_request(self, request):
        request_json = json.dumps(request) + '\n'
        self.process.stdin.write(request_json.encode())
        await self.process.stdin.drain()
        
        response_line = await self.process.stdout.readline()
        return json.loads(response_line.decode())

@pytest.mark.asyncio
async def test_server_tools_list():
    async with MCPTestProcess('my_mcp_server') as server:
        response = await server.send_request({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        })
        
        assert "result" in response
        assert "tools" in response["result"]
        assert len(response["result"]["tools"]) > 0
```

## Mock MCP Servers

### Hello World Mock Server

The MCP ecosystem provides mock servers for testing clients:

```typescript
// TypeScript mock server for client testing
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "mock-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Mock tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo back the input",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" }
        },
        required: ["message"]
      }
    }
  ]
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "echo") {
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${args.message}`
        }
      ]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

### Test Stub Patterns

Create reusable test stubs for common scenarios:

```python
class MockMCPServer:
    """Mock MCP server for testing clients"""
    
    def __init__(self):
        self.tools = {}
        self.resources = {}
        self.call_log = []
    
    def add_tool(self, name: str, handler, schema: dict):
        self.tools[name] = {"handler": handler, "schema": schema}
    
    async def handle_tools_list(self):
        return {
            "tools": [
                {"name": name, "inputSchema": tool["schema"]}
                for name, tool in self.tools.items()
            ]
        }
    
    async def handle_tools_call(self, name: str, arguments: dict):
        self.call_log.append({"tool": name, "args": arguments})
        
        if name in self.tools:
            return await self.tools[name]["handler"](arguments)
        
        raise ValueError(f"Unknown tool: {name}")

# Usage in tests
@pytest.fixture
def mock_server():
    server = MockMCPServer()
    
    async def echo_handler(args):
        return {"content": [{"type": "text", "text": f"Echo: {args['message']}"}]}
    
    server.add_tool("echo", echo_handler, {
        "type": "object",
        "properties": {"message": {"type": "string"}},
        "required": ["message"]
    })
    
    return server
```

## Testing Utilities and Libraries

### Available Testing Tools

1. **MCP Inspector CLI** - Official command-line testing tool
2. **FastMCP** - Python testing framework with in-memory server
3. **mcp-autotest** - YAML-based automated testing
4. **MCP Hello World** - Mock server for client testing
5. **Playwright MCP** - UI automation testing framework

### Custom Testing Utilities

Create project-specific utilities for common testing needs:

```typescript
// test-utils.ts
export function createMockNDKEvent(overrides: Partial<NDKEvent> = {}): NDKEvent {
  return {
    id: 'mock-id',
    kind: 1,
    content: 'Mock content',
    created_at: Math.floor(Date.now() / 1000),
    pubkey: 'mock-pubkey',
    tags: [],
    author: {
      profile: { name: 'Mock User' },
      pubkey: 'mock-pubkey'
    },
    ...overrides
  } as NDKEvent;
}

export function createMockMCPRequest(method: string, params: any = {}) {
  return {
    jsonrpc: '2.0',
    id: Math.random().toString(36),
    method,
    params
  };
}

export async function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000
): Promise<void> {
  const start = Date.now();
  
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (!condition()) {
    throw new Error('Condition not met within timeout');
  }
}
```

```python
# test_utils.py
import asyncio
import json
from typing import Dict, Any, Callable

class MockNDKEvent:
    """Mock NDK event for testing"""
    
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'mock-id')
        self.kind = kwargs.get('kind', 1)
        self.content = kwargs.get('content', 'Mock content')
        self.created_at = kwargs.get('created_at', 1234567890)
        self.pubkey = kwargs.get('pubkey', 'mock-pubkey')
        self.tags = kwargs.get('tags', [])
        self.author = kwargs.get('author', {'name': 'Mock User'})

def create_mock_mcp_request(method: str, params: Dict[str, Any] = None) -> Dict:
    """Create a mock MCP request"""
    return {
        "jsonrpc": "2.0",
        "id": "test-id",
        "method": method,
        "params": params or {}
    }

async def wait_for_condition(
    condition: Callable[[], bool],
    timeout: float = 5.0,
    interval: float = 0.1
) -> None:
    """Wait for a condition to become true"""
    start_time = asyncio.get_event_loop().time()
    
    while not condition():
        if asyncio.get_event_loop().time() - start_time > timeout:
            raise TimeoutError("Condition not met within timeout")
        await asyncio.sleep(interval)
```

## Best Practices

### 1. Test Organization and Naming

```
test/
├── unit/
│   ├── tools/
│   │   ├── test_notifications.py
│   │   ├── test_conversation.py
│   │   └── test_user_notes.py
│   ├── utils/
│   │   └── test_content_resolver.py
│   └── notifications/
│       ├── test_event_processor.py
│       └── test_storage.py
├── integration/
│   ├── test_tool_integration.py
│   └── test_notification_pipeline.py
├── e2e/
│   └── test_server_endpoints.py
├── fixtures/
│   ├── mock_events.json
│   └── test_data.py
└── utils/
    ├── test_helpers.py
    └── mock_servers.py
```

### 2. Test Data Management

Use fixtures and factories for consistent test data:

```python
# fixtures/test_data.py
import pytest
from datetime import datetime

@pytest.fixture
def sample_nostr_event():
    return {
        "id": "abc123",
        "kind": 1,
        "content": "Hello Nostr!",
        "created_at": int(datetime.now().timestamp()),
        "pubkey": "user123",
        "tags": [["t", "nostr"], ["t", "test"]]
    }

@pytest.fixture
def conversation_thread():
    """Fixture providing a complete conversation thread"""
    root_event = {
        "id": "root123",
        "kind": 1,
        "content": "Original post",
        "tags": []
    }
    
    reply_event = {
        "id": "reply123", 
        "kind": 1,
        "content": "Reply to post",
        "tags": [["e", "root123", "", "reply"]]
    }
    
    return {"root": root_event, "reply": reply_event}
```

### 3. Error Handling and Edge Cases

Always test error scenarios:

```typescript
describe('Error Handling', () => {
  it('should handle invalid user ID gracefully', async () => {
    const mockNdk = createMockNdk();
    
    await expect(userRootNotesTool.handler(
      { userId: 'invalid-id' },
      mockNdk
    )).rejects.toThrow('Invalid user ID provided');
  });

  it('should handle NDK connection failures', async () => {
    const mockNdk = createMockNdk();
    mockNdk.fetchEvents.mockRejectedValue(new Error('Network error'));
    
    const result = await userRootNotesTool.handler(
      { userId: 'valid-id' },
      mockNdk
    );
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to fetch');
  });
});
```

### 4. Performance and Load Testing

Include performance benchmarks in your test suite:

```python
import asyncio
import time
import pytest

@pytest.mark.asyncio
async def test_tool_performance():
    """Test that tools respond within acceptable time limits"""
    start_time = time.time()
    
    # Execute tool
    result = await my_tool.handler({"query": "test"})
    
    duration = time.time() - start_time
    
    # Assert response time is under 2 seconds
    assert duration < 2.0
    assert result is not None

@pytest.mark.asyncio 
async def test_concurrent_tool_calls():
    """Test handling of concurrent requests"""
    tasks = []
    
    for i in range(50):
        task = my_tool.handler({"id": f"test-{i}"})
        tasks.append(task)
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Verify all requests completed successfully
    errors = [r for r in results if isinstance(r, Exception)]
    assert len(errors) == 0
```

### 5. Mocking Best Practices

Use dependency injection and clear mock interfaces:

```python
from unittest.mock import AsyncMock, patch
from typing import Protocol

class NDKInterface(Protocol):
    async def fetchEvents(self, filter: dict) -> list: ...
    async def connect(self) -> None: ...

class MyTool:
    def __init__(self, ndk: NDKInterface):
        self.ndk = ndk
    
    async def search(self, query: str):
        events = await self.ndk.fetchEvents({"kinds": [1], "limit": 10})
        return self.process_events(events)

# In tests
@pytest.fixture
def mock_ndk():
    mock = AsyncMock(spec=NDKInterface)
    mock.fetchEvents.return_value = [
        {"id": "1", "content": "test event"}
    ]
    return mock

@pytest.mark.asyncio
async def test_search_tool(mock_ndk):
    tool = MyTool(mock_ndk)
    result = await tool.search("test query")
    
    assert len(result.events) == 1
    mock_ndk.fetchEvents.assert_called_once()
```

## Implementation Examples

### Complete Test Suite Example

Here's a complete example showing how to structure tests for an MCP tool:

```python
# test_conversation_tool.py
import pytest
from unittest.mock import AsyncMock, patch
import json

from src.tools.conversation import ConversationTool
from test.utils.mock_data import create_mock_event, create_conversation_thread

class TestConversationTool:
    """Test suite for conversation tool"""
    
    @pytest.fixture
    def mock_ndk(self):
        """Mock NDK instance"""
        mock = AsyncMock()
        mock.fetchEvents.return_value = []
        return mock
    
    @pytest.fixture  
    def conversation_tool(self, mock_ndk):
        """Conversation tool instance with mocked NDK"""
        return ConversationTool(mock_ndk)
    
    @pytest.mark.asyncio
    async def test_get_conversation_thread(self, conversation_tool, mock_ndk):
        """Test retrieving a conversation thread"""
        # Arrange
        thread_data = create_conversation_thread()
        mock_ndk.fetchEvents.return_value = [
            thread_data["root"],
            thread_data["reply"]
        ]
        
        # Act
        result = await conversation_tool.get_thread("root123")
        
        # Assert
        assert len(result.events) == 2
        assert result.events[0]["id"] == "root123"
        mock_ndk.fetchEvents.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_empty_conversation(self, conversation_tool, mock_ndk):
        """Test handling of empty conversation"""
        # Arrange
        mock_ndk.fetchEvents.return_value = []
        
        # Act
        result = await conversation_tool.get_thread("nonexistent")
        
        # Assert
        assert len(result.events) == 0
        assert result.message == "No events found"
    
    @pytest.mark.asyncio
    async def test_network_error_handling(self, conversation_tool, mock_ndk):
        """Test handling of network errors"""
        # Arrange
        mock_ndk.fetchEvents.side_effect = Exception("Network timeout")
        
        # Act & Assert
        with pytest.raises(Exception, match="Network timeout"):
            await conversation_tool.get_thread("test123")
    
    @pytest.mark.asyncio
    @pytest.mark.parametrize("event_count,expected_pages", [
        (10, 1),
        (50, 2), 
        (100, 4)
    ])
    async def test_pagination(self, conversation_tool, mock_ndk, event_count, expected_pages):
        """Test conversation pagination"""
        # Arrange
        events = [create_mock_event(id=f"event-{i}") for i in range(event_count)]
        mock_ndk.fetchEvents.return_value = events
        
        # Act
        result = await conversation_tool.get_thread("test", page_size=25)
        
        # Assert
        assert result.total_pages == expected_pages
        assert len(result.events) <= 25
```

### TypeScript Integration Test Example

```typescript
// test/integration/notification-system.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EventProcessor } from '../../src/notifications/EventProcessor';
import { NotificationBuilder } from '../../src/notifications/NotificationBuilder';
import { NotificationStorage } from '../../src/notifications/NotificationStorage';
import { SubscriptionManager } from '../../src/notifications/SubscriptionManager';
import { createMockNDKEvent, createMockNdk } from '../utils/test-helpers';

describe('Notification System Integration', () => {
  let processor: EventProcessor;
  let builder: NotificationBuilder;
  let storage: NotificationStorage;
  let subscriptionManager: SubscriptionManager;
  let mockNdk: any;

  beforeEach(() => {
    processor = new EventProcessor();
    builder = new NotificationBuilder();
    storage = new NotificationStorage(100);
    mockNdk = createMockNdk();
    subscriptionManager = new SubscriptionManager(mockNdk, storage);
  });

  afterEach(() => {
    subscriptionManager.cleanup();
  });

  it('should process mention notification end-to-end', async () => {
    // Arrange: Create a mention event
    const mentionEvent = createMockNDKEvent({
      kind: 1,
      content: 'Hey @alice, check this out!',
      tags: [['p', 'alice-pubkey']],
      author: { 
        profile: { name: 'Bob' },
        pubkey: 'bob-pubkey' 
      }
    });

    // Act: Process the event through the pipeline
    const categorized = processor.categorizeEvent(mentionEvent);
    const notification = builder.build(categorized, 'agent-pubkey');
    storage.store(notification);

    // Assert: Verify the complete flow
    expect(categorized.category).toBe('mention');
    expect(categorized.priority).toBe('high');
    
    const storedNotifications = storage.retrieve({ limit: 1 });
    expect(storedNotifications).toHaveLength(1);
    expect(storedNotifications[0].content).toContain('Bob mentioned you');
    expect(storedNotifications[0].tags.some(tag => 
      tag[0] === 'd' && tag[1].includes('mention')
    )).toBe(true);
  });

  it('should handle subscription lifecycle', async () => {
    // Arrange: Setup subscription
    const userPubkey = 'user123';
    
    // Act: Subscribe to user events
    await subscriptionManager.subscribeToUser(userPubkey);
    
    // Simulate incoming event
    const userEvent = createMockNDKEvent({
      pubkey: userPubkey,
      content: 'New post from subscribed user'
    });
    
    // Process through notification system
    mockNdk.emit('event', userEvent);
    await new Promise(resolve => setTimeout(resolve, 100)); // Allow processing
    
    // Assert: Notification was created and stored
    const notifications = storage.retrieve();
    expect(notifications.some(n => 
      n.content.includes('New post from subscribed user')
    )).toBe(true);
  });

  it('should respect rate limiting', async () => {
    // Arrange: Multiple rapid events from same user
    const events = Array.from({ length: 10 }, (_, i) => 
      createMockNDKEvent({
        id: `event-${i}`,
        pubkey: 'spammy-user',
        content: `Spam message ${i}`
      })
    );

    // Act: Process all events
    for (const event of events) {
      const categorized = processor.categorizeEvent(event);
      const notification = builder.build(categorized, 'agent-pubkey');
      storage.store(notification);
    }

    // Assert: Rate limiting was applied
    const notifications = storage.retrieve();
    const spamNotifications = notifications.filter(n => 
      n.content.includes('spammy-user')
    );
    
    // Should have fewer notifications than events due to rate limiting
    expect(spamNotifications.length).toBeLessThan(10);
  });
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: MCP Server Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18, 20]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Bun
      uses: oven-sh/setup-bun@v1
      with:
        bun-version: latest
    
    - name: Install dependencies
      run: bun install
    
    - name: Run unit tests
      run: bun test --coverage
    
    - name: Run integration tests
      run: bun test test/integration/
      env:
        MOCK_MODE: true
    
    - name: Run E2E tests
      run: bun test test/e2e/
      env:
        MOCK_MODE: true
        NDK_MOCK: true
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

  mcp-inspector-test:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Build server
      run: |
        bun install
        bun run build
    
    - name: Test with MCP Inspector
      run: |
        # Install MCP Inspector
        npm install -g @modelcontextprotocol/inspector
        
        # Start server in background
        node dist/index.js &
        SERVER_PID=$!
        
        # Wait for server to start
        sleep 2
        
        # Test tools list
        npx @modelcontextprotocol/inspector --cli \
          node dist/index.js --method tools/list
        
        # Test tool call
        npx @modelcontextprotocol/inspector --cli \
          node dist/index.js --method tools/call \
          --tool-name user_root_notes \
          --tool-arg userId=test123
        
        # Cleanup
        kill $SERVER_PID
```

### Python CI Example

```yaml
# .github/workflows/python-tests.yml
name: Python MCP Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        python-version: ['3.9', '3.10', '3.11']
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install fastmcp pytest pytest-asyncio pytest-cov
        pip install -r requirements.txt
    
    - name: Run unit tests
      run: |
        pytest test/unit/ -v --cov=src --cov-report=xml
    
    - name: Run integration tests
      run: |
        pytest test/integration/ -v
      env:
        TESTING: true
        MOCK_RELAYS: true
    
    - name: Run E2E tests
      run: |
        pytest test/e2e/ -v --timeout=30
      env:
        TESTING: true
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

## Summary

This comprehensive guide covers all aspects of MCP testing, from unit tests to end-to-end testing. Key takeaways:

1. **Use the MCP Inspector** for interactive testing and debugging
2. **Implement the testing pyramid** with more unit tests than integration or E2E tests
3. **Mock external dependencies** like Nostr relays for deterministic tests
4. **Test error scenarios** and edge cases thoroughly
5. **Use appropriate frameworks** like FastMCP for Python or Bun's built-in tester for TypeScript
6. **Integrate testing into CI/CD** pipelines for continuous quality assurance
7. **Create reusable test utilities** for common patterns and mock data

The MCP ecosystem provides excellent tooling for testing, but requires thoughtful test design to ensure reliability and maintainability of your MCP servers and tools.