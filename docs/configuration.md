# Configuration

The server reads six environment variables prefixed with `VISOR_MCP_`.
Three are required, three are optional. A `.env` file in the working
directory is auto-loaded at startup; process environment values take
precedence over `.env`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VISOR_MCP_API_KEY` | yes | — | API key for the provider (non-empty after trim). |
| `VISOR_MCP_BASE_URL` | yes | — | Provider base URL; scheme must be `http` or `https`. The path `chat/completions` is appended exactly once. |
| `VISOR_MCP_MODEL` | yes | — | Model name to send to the provider (non-empty after trim). |
| `VISOR_MCP_MAX_IMAGE_SIZE_MB` | no | `5` | Per-image size limit in MB; positive finite number. |
| `VISOR_MCP_REQUEST_TIMEOUT_MS` | no | `60000` | Per-attempt timeout for image downloads and provider requests in milliseconds; positive integer. |
| `VISOR_MCP_REQUEST_BODY_JSON` | no | `{}` | Extra Chat Completions parameters as a JSON object. The top-level keys `model`, `messages`, and `stream` are forbidden; `__proto__`, `prototype`, and `constructor` are forbidden at any depth. |

A missing or invalid required value writes `Error: <message>` to stderr,
sets exit code 1, and exits without connecting to MCP.

## Contents

- [Example .env](#example-env)
- [Passing Configuration to MCP Hosts](#passing-configuration-to-mcp-hosts)
    - [One-liner (opencode, Claude Code, Codex)](#one-liner-opencode-claude-code-codex)
    - [JSON Configuration](#json-configuration)
    - [GitHub Copilot (VS Code)](#github-copilot-vs-code)
    - [Global Install](#global-install)
    - [Local Build](#local-build)
- [Image Size Limit](#image-size-limit)
- [Per-Attempt Timeout](#per-attempt-timeout)
- [Request Body Extras](#request-body-extras)

## Example .env

```bash
VISOR_MCP_API_KEY=sk-or-v1-your-key-here
VISOR_MCP_BASE_URL=https://openrouter.ai/api/v1
VISOR_MCP_MODEL=claude-sonnet-5
# VISOR_MCP_MAX_IMAGE_SIZE_MB=5
# VISOR_MCP_REQUEST_TIMEOUT_MS=60000
# VISOR_MCP_REQUEST_BODY_JSON={"reasoning_effort":"medium"}
```

## Passing Configuration to MCP Hosts

### One-liner (opencode, Claude Code, Codex)

Pass credentials with `--env` flags:

```bash
opencode mcp add visor-mcp \
  --env VISOR_MCP_API_KEY=sk-or-v1-your-key-here \
  --env VISOR_MCP_BASE_URL=https://openrouter.ai/api/v1 \
  --env VISOR_MCP_MODEL=claude-sonnet-5 \
  -- npx -y visor-mcp
```

### JSON Configuration

For hosts that use `mcpServers` JSON (opencode, Claude Code, and most
other MCP-compatible agents), add this to your MCP settings file:

```json
{
  "mcpServers": {
    "visor-mcp": {
      "command": "npx",
      "args": ["-y", "visor-mcp"],
      "env": {
        "VISOR_MCP_API_KEY": "sk-or-v1-your-key-here",
        "VISOR_MCP_BASE_URL": "https://openrouter.ai/api/v1",
        "VISOR_MCP_MODEL": "claude-sonnet-5",
        "VISOR_MCP_MAX_IMAGE_SIZE_MB": "5",
        "VISOR_MCP_REQUEST_TIMEOUT_MS": "60000",
        "VISOR_MCP_REQUEST_BODY_JSON": "{}"
      }
    }
  }
}
```

All `VISOR_MCP_*` variables can go in the `env` object. The one-liner
commands pass credentials with `--env` flags instead.

### GitHub Copilot (VS Code)

Add this to `.vscode/mcp.json` in your workspace, or to your user-level
MCP settings (Command Palette → `MCP: Open User Configuration`):

```json
{
  "servers": {
    "visor-mcp": {
      "command": "npx",
      "args": ["-y", "visor-mcp"],
      "env": {
        "VISOR_MCP_API_KEY": "sk-or-v1-your-key-here",
        "VISOR_MCP_BASE_URL": "https://openrouter.ai/api/v1",
        "VISOR_MCP_MODEL": "claude-sonnet-5"
      }
    }
  }
}
```

### Global Install

If you prefer an explicit install step instead of `npx`:

```bash
npm install -g visor-mcp
```

Then use the `visor-mcp` binary in your MCP config instead of the `npx`
command and args:

```json
{
  "mcpServers": {
    "visor-mcp": {
      "command": "visor-mcp",
      "args": [],
      "env": {
        "VISOR_MCP_API_KEY": "sk-or-v1-your-key-here",
        "VISOR_MCP_BASE_URL": "https://openrouter.ai/api/v1",
        "VISOR_MCP_MODEL": "claude-sonnet-5"
      }
    }
  }
}
```

### Local Build

If you built the server from source, point to the compiled entry point
and set the working directory to the repository root so `.env` is found:

```json
{
  "mcpServers": {
    "visor-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "VISOR_MCP_API_KEY": "sk-or-v1-your-key-here",
        "VISOR_MCP_BASE_URL": "https://openrouter.ai/api/v1",
        "VISOR_MCP_MODEL": "claude-sonnet-5"
      }
    }
  }
}
```

## Image Size Limit

The default 5 MB limit applies uniformly to local files, remote
responses, and data URLs — reading, decoding, or downloading stops
immediately when the limit is exceeded. Raise it with
`VISOR_MCP_MAX_IMAGE_SIZE_MB` for large screenshots or diagrams.

## Per-Attempt Timeout

Each HTTP image download and provider attempt has a per-attempt timeout
(default 60 seconds via `VISOR_MCP_REQUEST_TIMEOUT_MS`). Each retry
gets a fresh timer — the timeout resets per attempt, not per call.

## Request Body Extras

`VISOR_MCP_REQUEST_BODY_JSON` accepts arbitrary JSON object parameters
that are merged into every Chat Completions request body. The
server-owned keys `model`, `messages`, and `stream` are always
protected and will win any collision. Useful for provider-specific
parameters like `reasoning_effort`, `top_p`, or `temperature`.

Example: `VISOR_MCP_REQUEST_BODY_JSON={"reasoning_effort":"medium","temperature":0.2}`
