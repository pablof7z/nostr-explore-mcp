# nostr_raw_publish Tool Usage Example

The `nostr_raw_publish` tool allows you to sign and publish any raw Nostr event by providing an unsigned event payload and an nsec for signing.

## Basic Usage

### Example 1: Publishing a Simple Note (Kind 1)

```json
{
  "event": "{\"kind\":1,\"content\":\"Hello Nostr!\",\"tags\":[]}",
  "nsec": "nsec1..."
}
```

### Example 2: Publishing a Long-Form Article (Kind 30023)

```json
{
  "event": "{\"kind\":30023,\"content\":\"# My Article\\n\\nThis is the content...\",\"tags\":[[\"title\",\"My Article\"],[\"summary\",\"A brief summary\"]]}",
  "nsec": "nsec1..."
}
```

### Example 3: Publishing a Reaction (Kind 7)

```json
{
  "event": "{\"kind\":7,\"content\":\"+\",\"tags\":[[\"e\",\"eventid\"],[\"p\",\"pubkey\"]]}",
  "nsec": "nsec1..."
}
```

## Response Format

On success, the tool returns:

```json
{
  "nevent1": "nevent1qqs..."
}
```

The `nevent1` value is the bech32-encoded event identifier that can be used to reference the published event.

## Error Handling

The tool validates:
- JSON syntax of the event payload
- Required fields (`kind` and `content`)
- Signing credentials availability

If any validation fails, an error message will be returned explaining the issue.

## Notes

- The `tags` field is optional and defaults to an empty array if not provided
- The `created_at` field is optional and will be set automatically if not provided
- The tool uses the same relay configuration as other publishing tools in the MCP server