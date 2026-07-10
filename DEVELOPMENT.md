# Development

## Prerequisites

- Node.js 24 or later
- pnpm 10 or later

## Setup

```bash
pnpm install
```

## Quality Checks

Run the complete local gate before opening a pull request:

```bash
pnpm check
pnpm build
```

The MCP server will use stdio when implemented. Keep protocol messages on
stdout and send logs to stderr.
