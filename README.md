# vision-mcp

MCP server that adds vision capabilities to text-only models through any
OpenAI-compatible Chat Completions provider. Supports PNG, JPEG, WebP, and
static GIF images supplied as a data URL, an absolute local file path, or an
HTTP/HTTPS URL.

## How It Works

The server loads, size-bounds, and byte-validates every image itself, then
composes one system message and one user message with ordered inline image
parts (as data URLs with no `detail`) and one text part. A non-streaming
`POST {base URL}/chat/completions` request with `Authorization: Bearer` is
dispatched to the configured provider; the first choice's text is returned as
one MCP content item. image bytes and prompts are sent to the provider;
nothing (images, prompts, responses) is retained or cached after the call.

The data flow for one `analyze_image` call:

- **Input validation**: The tool handler validates the caller's arguments
  (schema strips unknown keys, rejects whitespace-only strings).
- **Image loading**: `loadImage` classifies the source (data URL, absolute
  local file path, HTTP/HTTPS URL), loads it, applies the configured size
  limit, and byte-validates the format to produce a validated image.
- **Provider analysis**: The server composes `{ model, messages: [system,
  user[images, text]], stream: false, ...extras }`, sends a `POST` with
  `Authorization: Bearer` to `{base URL}/chat/completions`, runs the
  per-attempt timeout and retry loop, and normalizes the first choice.
- **Result**: One MCP text content item on success, or an `Error: ...` result
  with `isError: true` on any failure. Image bytes never reach the provider
  on validation failure; nothing is retained or cached after the call.

## Installation

From npm:

```bash
npm install -g vision-mcp
```

Alternatively, run without installing:

```bash
npx vision-mcp
```

From a repository checkout:

```bash
pnpm install && pnpm build
node build/index.js
```

The published package exposes the `vision-mcp` executable (from
`package.json` `bin`).

## Configuration

The server reads six environment variables prefixed with `VISION_MCP_`. Three
are required, three are optional. A `.env` file in the working directory is
auto-loaded at startup; process environment values take precedence over
`.env`.

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

A missing or invalid required value writes `Error: <message>` to stderr, sets
exit code 1, and never connects to MCP.

## MCP Host Setup

Add `vision-mcp` to your host's `mcpServers` configuration. The `env` object
carries the six `VISION_MCP_*` variables.

**npm-installed (via npx):**

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

**Repository build:**

```json
{
  "mcpServers": {
    "vision-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
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

Set the working directory to the repository root so the `.env` file is found.

## Tools

The server exposes seven tools in this discovery order:

| Tool | Purpose | Fields |
| --- | --- | --- |
| `ui_diff_check` | Compare an expected UI screenshot with an actual implementation to find visual discrepancies. | `expected_image_source` (always sent first), `actual_image_source`, `prompt` |
| `ui_to_artifact` | Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description. | `image_source`, `output_type` (one of `code`, `prompt`, `spec`, `description`), `prompt` |
| `extract_text_from_screenshot` | Transcribe text from screenshots of source code, terminal output, configuration, or prose. | `image_source`, `prompt`, `programming_language` (optional) |
| `diagnose_error_screenshot` | Analyze a screenshot containing an error, exception, or stack trace for diagnosis. | `image_source`, `prompt`, `context` (optional) |
| `understand_technical_diagram` | Explain architecture diagrams, flowcharts, UML, entity-relationship, and sequence diagrams. | `image_source`, `prompt`, `diagram_type` (optional) |
| `analyze_image` | General-purpose image analysis; the fallback for requests not covered by a specialized tool. | `image_source`, `prompt` |
| `analyze_data_visualization` | Analyze charts, graphs, and dashboards for metrics, patterns, and insights. | `image_source`, `prompt`, `analysis_focus` (optional) |

Every `image_source` accepts a data URL, an absolute local file path, or an
HTTP/HTTPS URL. Required and optional string fields must be non-whitespace.
Unknown fields are accepted (stripped). The optional hints
(`programming_language`, `context`, `diagram_type`, `analysis_focus`) are
free-text — when supplied, they inform the analysis without overriding the
tool's built-in purpose.

`ui_diff_check` sends the expected image first and the actual image second;
the user prompt is prefixed with an explicit role block marking the first
image as EXPECTED/REFERENCE and the second as ACTUAL/CURRENT. Both images are
validated before any provider call — an invalid expected or actual source
aborts atomically.

## Image Sources & Formats

**Accepted sources:**

- Base64 `data:` URL
- Absolute local file path
- HTTP/HTTPS URL

Rejected without conversion: `ftp:`, `file:`, relative paths, and non-`base64`
data URLs.

**Accepted formats** (detected from bytes):

- PNG
- JPEG
- WebP
- Static GIF

Rejected without conversion: SVG, animated GIF, malformed bytes, and content
whose declared type or extension conflicts with its detected bytes.

**Size limit:** 5 MB per image by default, configurable via
`VISION_MCP_MAX_IMAGE_SIZE_MB`. The limit applies uniformly to local files,
remote responses, and data URLs — reading, decoding, or downloading stops
immediately when the limit is exceeded.

**HTTP downloads:** unauthenticated `GET`, at most 5 redirects. Redirects may
switch between HTTP and HTTPS but not to another scheme. Credentials and
fragments are stripped before fetch; query values are redacted from
diagnostics.

## Reliability & Cancellation

The server retries transient failures at most twice after the initial attempt,
for at most three total attempts. Backoff is 1 s then 2 s.

**Transient failures (retried):** connection errors, per-attempt timeouts,
HTTP 408, HTTP 429, HTTP 5xx.

**Permanent failures (not retried):** validation errors, malformed provider
responses, HTTP 4xx other than 408 and 429, and cancellation.

Each HTTP image download and provider attempt has a per-attempt timeout
(default 60,000 ms via `VISION_MCP_REQUEST_TIMEOUT_MS`). Each retry gets a
fresh timer — the timeout resets per attempt, not per call. At the default
timeout, a hung `analyze_image` call surfaces `Error: provider request failed`
after at most ~183 s (3 × 60 s + 1 s + 2 s).

**Cancellation:** The MCP host's cancellation signal (`extra.signal`)
propagates through image loading, provider requests, and retry delays. An
in-flight fetch or read is aborted promptly, the retry loop short-circuits
without dispatching another attempt, and the call returns
`Error: Request cancelled` with `isError: true`. Concurrent calls are
independent — each carries its own signal and the server imposes no global
concurrency limit.

## Troubleshooting

All diagnostics go to stderr; stdout carries exclusively MCP JSON-RPC
protocol traffic.

**Missing or invalid configuration at startup:**

The server writes `Error: VISION_MCP_<VAR> is required`, `Error:
VISION_MCP_<VAR> must be <constraint>`, or `Error: Startup failed: invalid
configuration.` to stderr, sets exit code 1, and exits without connecting
to MCP.

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

All error results return one text item with `isError: true` and text prefixed
with `Error:`. API keys, authorization headers, prompts, image data, request
bodies, sensitive provider response bodies, and URL query values are never
disclosed in diagnostics or error results.

## Security & Privacy

- **Absolute local file access**: The server can read any absolute image file
  accessible to the process. Callers can specify an absolute local file path
  as the image source, and the server will read and forward its contents. The
  server does not enforce source allowlists or sandboxing.
- **Unrestricted HTTP/HTTPS**: The server makes unrestricted HTTP and HTTPS
  requests to any destination, including private networks (loopback,
  link-local, RFC1918). Image URLs and the provider base URL may point to
  private or internal hosts. Neither local file paths nor network destinations
  are allowlisted.
- **Unencrypted HTTP**: The provider base URL and image URLs may use plain
  HTTP (unencrypted). Image bytes and prompts sent over HTTP are transmitted
  in cleartext and visible to any observer on the network path.
- **Provider data transfer**: Image bytes and prompts are sent to the
  configured provider. The server performs no content moderation, factual
  verification, or output redaction. Choose a provider whose data handling
  practices you trust.

**Redaction guarantees:** API keys, authorization headers, prompts, image
data, request bodies, sensitive provider response bodies, and URL query values
are never disclosed in stderr diagnostics or MCP tool-error results. Only
curated, non-sensitive error messages reach the user.

## License & Attribution

MIT. Behavioral compatibility derives from `@z_ai/mcp-server` (Apache-2.0),
without implying Z.AI endorsement.
