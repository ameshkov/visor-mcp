# Vision MCP

[![CI](https://github.com/ameshkov/vision-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ameshkov/vision-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/vision-mcp)](https://www.npmjs.com/package/vision-mcp)

> MCP server that adds vision capabilities to text-only models through any
> OpenAI-compatible Chat Completions provider.

<p align="center">
  <!-- TODO: add screenshot -->
  <img src="assets/screenshot.png" alt="Vision MCP screenshot" width="600">
</p>

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Connecting Coding Agents](#connecting-coding-agents)
- [Tools](#tools)
- [Image Sources & Formats](#image-sources--formats)
- [Reliability & Cancellation](#reliability--cancellation)
- [Troubleshooting](#troubleshooting)
- [Security & Privacy](#security--privacy)
- [How It Works](#how-it-works)
- [Documentation](#documentation)

---

## The Problem

Text-only language models cannot see or analyze images. When you share a
screenshot of a UI, an error dialog, a chart, or a diagram with a text-only
model, it cannot extract the visual information. You lose the ability to
ask questions like "what does this error mean?", "convert this design to
code", or "what trends do you see in this chart?".

## The Solution

Vision MCP is a Model Context Protocol server that bridges this gap. It
accepts an image from your coding agent — a data URL, a local file path,
or a remote HTTP URL — and forwards it to an OpenAI-compatible vision
provider (like GPT-4o). The provider analyzes the image and returns a
text response that flows back to your agent.

You get vision analysis without needing a model with native vision
support. The server handles image loading, format validation, size
limits, retries, timeouts, and cancellation — your agent just calls a
tool and receives the result.

## Prerequisites

- **Node.js 24 or later** — the server runs on Node.js and is launched
  via `npx`, so no separate install step is required.
- **An OpenAI-compatible vision provider** — you need an API key, a base
  URL, and a model name for a provider that supports image inputs in
  Chat Completions (e.g., OpenAI, compatible proxies).
- **A coding agent that supports MCP servers over stdio** — this
  includes opencode, Claude Code, Codex, GitHub Copilot, Cursor, and
  any MCP-compatible host.

## Quick Start

Run the one-liner for your coding agent. Pass credentials with `-e` flags
— no `.env` file needed. The server is downloaded on first use via `npx`.

**opencode:**

```bash
opencode mcp add vision-mcp \
  -e VISION_MCP_API_KEY=sk-your-key-here \
  -e VISION_MCP_BASE_URL=https://api.openai.com/v1 \
  -e VISION_MCP_MODEL=gpt-4o \
  -- npx -y vision-mcp
```

**Claude Code:**

```bash
claude mcp add vision-mcp \
  -e VISION_MCP_API_KEY=sk-your-key-here \
  -e VISION_MCP_BASE_URL=https://api.openai.com/v1 \
  -e VISION_MCP_MODEL=gpt-4o \
  -- npx -y vision-mcp
```

**Codex:**

```bash
codex mcp add vision-mcp \
  -e VISION_MCP_API_KEY=sk-your-key-here \
  -e VISION_MCP_BASE_URL=https://api.openai.com/v1 \
  -e VISION_MCP_MODEL=gpt-4o \
  -- npx -y vision-mcp
```

**GitHub Copilot (VS Code):** add this to `.vscode/mcp.json` in your
workspace, or to your user-level MCP settings (Command Palette →
`MCP: Open User Configuration`):

```json
{
  "servers": {
    "vision-mcp": {
      "command": "npx",
      "args": ["-y", "vision-mcp"],
      "env": {
        "VISION_MCP_API_KEY": "sk-your-key-here",
        "VISION_MCP_BASE_URL": "https://api.openai.com/v1",
        "VISION_MCP_MODEL": "gpt-4o"
      }
    }
  }
}
```

For JSON-based MCP host configuration, a global install, or a local
build, see [Connecting Coding Agents](#connecting-coding-agents).
For the full list of environment variables, see
[Configuration](#configuration).

## Configuration

The server reads six environment variables prefixed with `VISION_MCP_`.
Three are required, three are optional. A `.env` file in the working
directory is auto-loaded at startup; process environment values take
precedence over `.env`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VISION_MCP_API_KEY` | yes | — | API key for the provider (non-empty after trim). |
| `VISION_MCP_BASE_URL` | yes | — | Provider base URL; scheme must be `http` or `https`. The path `chat/completions` is appended exactly once. |
| `VISION_MCP_MODEL` | yes | — | Model name to send to the provider (non-empty after trim). |
| `VISION_MCP_MAX_IMAGE_SIZE_MB` | no | `5` | Per-image size limit in MB; positive finite number. |
| `VISION_MCP_REQUEST_TIMEOUT_MS` | no | `60000` | Per-attempt timeout for image downloads and provider requests in milliseconds; positive integer. |
| `VISION_MCP_REQUEST_BODY_JSON` | no | `{}` | Extra Chat Completions parameters as a JSON object. The top-level keys `model`, `messages`, and `stream` are forbidden; `__proto__`, `prototype`, and `constructor` are forbidden at any depth. |

Example `.env`:

```bash
VISION_MCP_API_KEY=sk-your-key-here
VISION_MCP_BASE_URL=https://api.openai.com/v1
VISION_MCP_MODEL=gpt-4o
# VISION_MCP_MAX_IMAGE_SIZE_MB=5
# VISION_MCP_REQUEST_TIMEOUT_MS=60000
# VISION_MCP_REQUEST_BODY_JSON={"reasoning_effort":"medium"}
```

A missing or invalid required value writes `Error: <message>` to stderr,
sets exit code 1, and exits without connecting to MCP.

## Connecting Coding Agents

The [Quick Start](#quick-start) covers the one-line connection commands for
opencode, Claude Code, and Codex. This section covers JSON-based MCP
configuration, the GitHub Copilot JSON config, and running a local build.

### JSON Configuration

For hosts that use `mcpServers` JSON (opencode, Claude Code, and most
other MCP-compatible agents), add this to your MCP settings file:

```json
{
  "mcpServers": {
    "vision-mcp": {
      "command": "npx",
      "args": ["-y", "vision-mcp"],
      "env": {
        "VISION_MCP_API_KEY": "sk-your-key-here",
        "VISION_MCP_BASE_URL": "https://api.openai.com/v1",
        "VISION_MCP_MODEL": "gpt-4o",
        "VISION_MCP_MAX_IMAGE_SIZE_MB": "5",
        "VISION_MCP_REQUEST_TIMEOUT_MS": "60000",
        "VISION_MCP_REQUEST_BODY_JSON": "{}"
      }
    }
  }
}
```

All `VISION_MCP_*` variables listed in [Configuration](#configuration) can
go in the `env` object. The one-liner commands in Quick Start pass
credentials with `-e` flags instead.

### Global Install

If you prefer an explicit install step instead of `npx`:

```bash
npm install -g vision-mcp
```

Then use the `vision-mcp` binary in your MCP config instead of the `npx`
command and args:

```json
{
  "mcpServers": {
    "vision-mcp": {
      "command": "vision-mcp",
      "args": [],
      "env": { "VISION_MCP_API_KEY": "...", "VISION_MCP_BASE_URL": "...", "VISION_MCP_MODEL": "..." }
    }
  }
}
```

### GitHub Copilot (VS Code)

Add this to `.vscode/mcp.json` in your workspace, or to your user-level
MCP settings (Command Palette → `MCP: Open User Configuration`):

```json
{
  "servers": {
    "vision-mcp": {
      "command": "npx",
      "args": ["-y", "vision-mcp"],
      "env": {
        "VISION_MCP_API_KEY": "sk-your-key-here",
        "VISION_MCP_BASE_URL": "https://api.openai.com/v1",
        "VISION_MCP_MODEL": "gpt-4o"
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
    "vision-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "VISION_MCP_API_KEY": "sk-your-key-here",
        "VISION_MCP_BASE_URL": "https://api.openai.com/v1",
        "VISION_MCP_MODEL": "gpt-4o"
      }
    }
  }
}

## Tools

The server exposes seven tools. Each accepts an `image_source` (data URL,
absolute local file path, or HTTP/HTTPS URL) and a `prompt`. Required and
optional string fields must be non-whitespace. Unknown fields are
accepted (stripped).

| Tool | Purpose | Fields |
| --- | --- | --- |
| `ui_diff_check` | Compare an expected UI screenshot with an actual implementation to find visual discrepancies. | `expected_image_source`, `actual_image_source`, `prompt` |
| `ui_to_artifact` | Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description. | `image_source`, `output_type` (one of `code`, `prompt`, `spec`, `description`), `prompt` |
| `extract_text_from_screenshot` | Transcribe text from screenshots of source code, terminal output, configuration, or prose. | `image_source`, `prompt`, `programming_language` (optional) |
| `diagnose_error_screenshot` | Analyze a screenshot containing an error, exception, or stack trace for diagnosis. | `image_source`, `prompt`, `context` (optional) |
| `understand_technical_diagram` | Explain architecture diagrams, flowcharts, UML, entity-relationship, and sequence diagrams. | `image_source`, `prompt`, `diagram_type` (optional) |
| `analyze_image` | General-purpose image analysis; the fallback for requests not covered by a specialized tool. | `image_source`, `prompt` |
| `analyze_data_visualization` | Analyze charts, graphs, and dashboards for metrics, patterns, and insights. | `image_source`, `prompt`, `analysis_focus` (optional) |

### `ui_diff_check`

Compares two images side-by-side for visual-regression testing. The
expected (reference) image is sent first, the actual (current) image
second. Both images are validated before any provider call — an invalid
expected or actual source aborts atomically.

### `ui_to_artifact`

Converts a UI screenshot into one of four output types selected via
`output_type`:

| Value | Result |
| --- | --- |
| `code` | Frontend code (HTML, CSS, JS, or framework-specific). |
| `prompt` | An AI prompt that can recreate the UI. |
| `spec` | A design specification document. |
| `description` | A natural-language description of the UI. |

### Optional Hints

The optional fields (`programming_language`, `context`, `diagram_type`,
`analysis_focus`) are free-text hints. When supplied, they inform the
analysis without overriding the tool's built-in purpose.

## Image Sources & Formats

**Accepted sources:**

- Base64 `data:` URL
- Absolute local file path
- HTTP/HTTPS URL

Rejected without conversion: `ftp:`, `file:`, relative paths, and
non-`base64` data URLs.

**Accepted formats** (detected from bytes):

- PNG
- JPEG
- WebP
- Static GIF

Rejected without conversion: SVG, animated GIF, malformed bytes, and
content whose declared type or extension conflicts with its detected
bytes.

**Size limit:** 5 MB per image by default, configurable via
`VISION_MCP_MAX_IMAGE_SIZE_MB`. The limit applies uniformly to local
files, remote responses, and data URLs — reading, decoding, or
downloading stops immediately when the limit is exceeded.

**HTTP downloads:** unauthenticated `GET`, at most 5 redirects. Redirects
may switch between HTTP and HTTPS but not to another scheme. Credentials
and fragments are stripped before fetch; query values are redacted from
diagnostics.

## Reliability & Cancellation

The server retries transient failures at most twice after the initial
attempt, for at most three total attempts. Backoff is 1 s then 2 s.

**Transient failures (retried):** connection errors, per-attempt
timeouts, HTTP 408, HTTP 429, HTTP 5xx.

**Permanent failures (not retried):** validation errors, malformed
provider responses, HTTP 4xx other than 408 and 429, and cancellation.

Each HTTP image download and provider attempt has a per-attempt timeout
(default 60000 ms via `VISION_MCP_REQUEST_TIMEOUT_MS`). Each retry gets a
fresh timer — the timeout resets per attempt, not per call. At the
default timeout, a hung call surfaces `Error: provider request failed`
after at most ~183 s (3 × 60 s + 1 s + 2 s).

**Cancellation:** The MCP host's cancellation signal propagates through
image loading, provider requests, and retry delays. An in-flight fetch
or read is aborted promptly, the retry loop short-circuits without
dispatching another attempt, and the call returns `Error: Request
cancelled` with `isError: true`. Concurrent calls are independent —
each carries its own signal and the server imposes no global concurrency
limit.

## Troubleshooting

All diagnostics go to stderr; stdout carries exclusively MCP JSON-RPC
protocol traffic.

**Missing or invalid configuration at startup:**

The server writes `Error: VISION_MCP_<VAR> is required`, `Error:
VISION_MCP_<VAR> must be <constraint>`, or `Error: Startup failed:
invalid configuration.` to stderr, sets exit code 1, and exits without
connecting to MCP.

**Common tool-call failures:**

| Failure | Curated error message |
| --- | --- | --- |
| Bad image path | `image source file was not found` |
| Path is not a regular file | `image source is not a file` |
| Unsupported image source scheme | `image source scheme is not supported` |
| Image exceeds the size limit | `image exceeds the configured size limit` |
| Declared format conflicts with detected bytes | `image declared format does not match its bytes` |
| Unsupported or malformed format | `image is not a supported format` |
| Exceeded HTTP redirect cap | `image download exceeded the redirect limit` |
| Provider connection failure, timeout, or hung provider | `provider request failed` |
| Non-JSON, empty, or refusal-only provider response | `malformed provider response` |
| Call cancelled by the MCP host | `Request cancelled` |

All error results return one text item with `isError: true` and text
prefixed with `Error:`. API keys, authorization headers, prompts, image
data, request bodies, sensitive provider response bodies, and URL query
values are never disclosed in diagnostics or error results.

## Security & Privacy

- **Absolute local file access**: The server can read any absolute image
  file accessible to the process. Callers can specify an absolute local
  file path as the image source, and the server will read and forward its
  contents. The server does not enforce source allowlists or sandboxing.
- **Unrestricted HTTP/HTTPS**: The server makes unrestricted HTTP and
  HTTPS requests to any destination, including private networks
  (loopback, link-local, RFC1918). Image URLs and the provider base URL
  may point to private or internal hosts. Neither local file paths nor
  network destinations are allowlisted.
- **Unencrypted HTTP**: The provider base URL and image URLs may use
  plain HTTP (unencrypted). When image bytes and prompts are sent over
  HTTP, they are transmitted in cleartext and visible to any observer
  on the network path.
- **Provider data transfer**: The image bytes and prompts are sent to the
  configured provider. The server performs no content moderation, factual
  verification, or output redaction. Choose a provider whose data
  handling practices you trust.

**Redaction guarantees:** API keys, authorization headers, prompts, image
data, request bodies, sensitive provider response bodies, and URL query
values are never disclosed in stderr diagnostics or MCP tool-error
results. Only curated, non-sensitive error messages reach the user.

## How It Works

The server loads, size-bounds, and byte-validates every image itself,
then composes one system message and one user message with ordered inline
image parts (as data URLs) and one text part. A non-streaming `POST {base
URL}/chat/completions` request with `Authorization: Bearer` is dispatched
to the configured provider; the first choice's text is returned as one
MCP content item. The provider receives the image bytes and prompts;
nothing (images, prompts, responses) is retained or cached after the call.

The data flow for one tool call:

- **Input validation**: The tool handler validates the caller's arguments
  (schema strips unknown keys, rejects whitespace-only strings).
- **Image loading**: The server classifies the source (data URL, absolute
  local file path, HTTP/HTTPS URL), loads it, applies the configured size
  limit, and byte-validates the format.
- **Provider analysis**: The server composes the request, sends a `POST`
  with `Authorization: Bearer` to `{base URL}/chat/completions`, runs the
  per-attempt timeout and retry loop, and normalizes the first choice.
- **Result**: One MCP text content item on success, or an `Error: ...`
  result with `isError: true` on any failure. Image bytes never reach the
  provider on validation failure.

## License & Attribution

MIT. Behavioral compatibility derives from `@z_ai/mcp-server` (Apache-2.0),
without implying Z.AI endorsement.

---

## Documentation

- [Development](DEVELOPMENT.md) — how to set up and contribute
- [LLM agent rules](AGENTS.md) — AI-assisted development guidelines
- [Changelog](CHANGELOG.md) — version history
