# Testing the Fixed Raw Publish Tool

## The Problem
The `nostr_raw_publish` tool's input schema was not properly constructed due to the spread operator with conditional properties not working as expected, resulting in missing parameters.

## The Solution
Changed from using spread operators with conditionals to using an IIFE (Immediately Invoked Function Expression) that properly builds the schema object:

```typescript
inputSchema: (() => {
  const properties: any = {
    event: {
      type: 'string',
      description: 'The unsigned event payload as a JSON string (must include "kind", "content", and optionally "tags")'
    }
  };
  
  const nsecSchema = getNsecSchema();
  if (nsecSchema) {
    properties.nsec = nsecSchema;
  }
  
  const required = ['event'];
  if (isNsecRequired()) {
    required.push('nsec');
  }
  
  return {
    type: 'object',
    properties,
    required
  };
})()
```

## Usage Example
The tool now properly exposes its parameters:
- `event` (required): JSON string of the unsigned event containing `kind`, `content`, and optionally `tags`
- `nsec` (conditional): Required if no NOSTR_PRIVATE_KEY environment variable is set

Example event payload:
```json
{
  "kind": 1,
  "content": "Hello Nostr!",
  "tags": []
}
```