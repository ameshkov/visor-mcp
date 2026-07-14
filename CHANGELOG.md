# Changelog

## Unreleased

### Added

- Replaced the scaffold `README.md` with a complete operator-focused guide
  covering installation (`npm install`, `npx`, repository build), MCP host
  setup with JSON config snippets, all six `VISION_MCP_*` environment
  variables (required and optional, with validation rules), the seven tool
  contracts in discovery order, the `output_type` enum, image sources (data
  URL, absolute local file path, HTTP/HTTPS URL) and formats (PNG, JPEG,
  WebP, static GIF), the data flow to the configured provider,
  retries and cancellation (3 total attempts, 1 s then 2 s backoff,
  per-attempt 60 000 ms timeout, fresh timer per retry, ~183 s worst case,
  `Error: Request cancelled` on abort), troubleshooting with curated error
  messages and stdout/stderr discipline, and the security and privacy
  disclosures (absolute local file access, unrestricted HTTP/HTTPS including
  private networks, unencrypted HTTP, provider data transfer). Added
  `src/test/docs/readme-topics.test.ts` to lock every required operator topic
  against regressions.

- Retries transient image-download and provider failures (connection errors,
  per-attempt timeouts, HTTP 408, 429, and 5xx) at most twice after
  one-second and two-second delays, up to three total attempts. Each HTTP
  download and provider attempt now has a per-attempt timeout driven by
  `VISION_MCP_REQUEST_TIMEOUT_MS` (default 60,000 ms). Permanent failures
  (validation errors, malformed provider responses, other 4xx responses)
  are not retried, and exhausted retries return one sanitized
  `Error: ...` MCP result. Adds a shared `src/utils/retry.ts` driver,
  extracts HTTP image loading into `src/services/images/http-image.ts`,
  and splits `src/test/utils/helpers.ts` into focused modules with
  stateful mock responses and delay/hang support.
- Every tool parameter now carries a `description` that is emitted into the
  tool input schema, so clients receive per-field guidance via `tools/list`.
  String parameters use a new `nonWhitespaceField(description)` factory that
  returns a fresh, described schema per field (no cross-field `$ref`
  deduplication) while preserving the non-empty, non-whitespace validation.
- Expanded every tool-level `description` into a structured multi-paragraph
  contract with `Use this tool ONLY when ...` and `Do NOT use for: ...`
  sections, matching the reference `@z_ai/mcp-server` style.
- Activated the `ui_diff_check` tool end to end. It compares an
  expected/reference UI screenshot with an actual implementation to
  identify visual and implementation discrepancies using the normative
  visual-regression system prompt. The user message is the caller
  `prompt` prefixed with an `<images>` role block stating that the
  first image is the EXPECTED/REFERENCE target and the second is the
  ACTUAL/CURRENT implementation, followed by a blank line and the
  prompt. Both image sources are resolved and byte-validated before
  any provider call via a new shared `runDualImageAnalysis` helper in
  `src/server/tools/common.ts`, so an invalid expected or actual source
  aborts the whole call atomically and the provider receives neither
  image. The two images are always sent in expected-first /
  actual-second order, followed by one text part, with no `detail`
  field on the image parts. Blank or whitespace-only fields and unknown
  arguments (stripped) are handled at the schema layer before the
  provider is called.
- Activated the `analyze_data_visualization` tool end to end. It analyzes
  charts, graphs, and dashboards to extract metrics, patterns, anomalies,
  and actionable insights using the normative data-visualization system
  prompt. When an optional nonblank `analysis_focus` is supplied, the
  user message is `prompt` followed by a blank line and a
  `<analysis_focus>Focus particularly on: {analysis_focus}.</analysis_focus>`
  tag; when omitted, the caller `prompt` is forwarded unchanged alongside
  one validated inline image. Blank or whitespace-only `analysis_focus`
  values and invalid image sources are rejected before the provider is
  called; unknown arguments are accepted (stripped).
- Activated the `understand_technical_diagram` tool end to end. It explains
  architecture diagrams, flowcharts, UML, entity-relationship diagrams,
  sequence diagrams, and other technical visualizations using the normative
  technical-diagram system prompt. When an optional nonblank `diagram_type`
  is supplied, the user message is `prompt` followed by a blank line and a
  `<diagram_type_hint>This is a {diagram_type} diagram.</diagram_type_hint>`
  tag; when omitted, the caller `prompt` is forwarded unchanged alongside one
  validated inline image. Blank or whitespace-only `diagram_type` values and
  invalid image sources are rejected before the provider is called; unknown
  arguments are accepted (stripped).
- Activated the `diagnose_error_screenshot` tool end to end. It
  diagnoses screenshots of errors, exceptions, and stack traces using
  the normative error-diagnosis system prompt. When an optional
  nonblank `context` is supplied, the user message is `prompt`
  followed by a blank line and a
  `<error_context>This error occurred {context}.</error_context>` tag;
  when omitted, the caller `prompt` is forwarded unchanged alongside
  one validated inline image. Blank or whitespace-only `context`
  values and invalid image sources are rejected before the provider is
  called; unknown arguments are accepted (stripped).
- Activated the `extract_text_from_screenshot` tool end to end. It transcribes
  text from screenshots of source code, terminal output, configuration,
  documentation, or general prose using the normative OCR system prompt. When
  an optional nonblank `programming_language` is supplied, the user message is
  `prompt` followed by a blank line and a
  `<language_hint>The code is in {programming_language}.</language_hint>` tag;
  when omitted, the caller `prompt` is forwarded unchanged alongside one
  validated   inline image. Blank or whitespace-only
  `programming_language` values and invalid image sources are rejected before
  the provider is called; unknown arguments are accepted (stripped).
- Activated the `ui_to_artifact` tool end to end. It converts a UI screenshot
  into frontend code, an AI recreation prompt, a design specification, or a
  natural-language description based on the `output_type` enum (`code`,
  `prompt`, `spec`, `description`). The four normative system prompts are
  embedded in the prompt catalog and selected per invocation; the caller
  `prompt` is forwarded unchanged as the user text alongside one validated
  inline image. Invalid `output_type` values and invalid image sources are
  rejected before the provider is called.
- Image validation now accepts PNG, JPEG, WebP, and static GIF images from
  every supported source (data URL, absolute local file, HTTP/HTTPS URL).
  MIME type is detected from the image bytes and emitted in the provider data
  URL. Animated GIFs are rejected.
- Initialized the TypeScript MCP server scaffold and development tooling.
- Added `fixtures/mcp-tester/`, a self-contained pnpm project that spawns
  the MCP server, discovers tools via the MCP SDK `Client` over stdio,
  and runs one `.case.ts` fixture per tool. See
  `fixtures/mcp-tester/README.md` for setup and usage.
- Documented a VSCode debugging workflow for `mcp-tester` that relies on
  the tester's full env forwarding (`serverEnv()`) and VSCode
  `autoAttachChildProcesses` to auto-attach a debugger to the spawned
  vision-mcp server. The documented `launch.json` enables
  `MCP_TESTER_LIVE=1` so the real `analyze_image` handler is exercised
  end to end against a provider; see `fixtures/mcp-tester/README.md`
  (Debugging) and `DEVELOPMENT.md` (Debug the MCP Server).
- Added mock-provider integration tests in
  `src/services/provider/provider.test.ts` covering request extras of every
  JSON value type (nested objects, arrays, scalars, nulls), server-owned
  field protection at the composition layer, every response
  normalization variant (string, fragmented text, mixed text/non-text,
  refusal-only, tool-calls-only, audio-only, empty choices, missing
  choices, non-object body), sanitized error containment for 5xx and
  malformed-response paths, and the non-retry property for malformed first
  choices.

- Propagates each MCP call's cancellation signal through local file reads,
  remote HTTP downloads, two-image resolution, provider requests, and retry
  delays. A cancelled call aborts its in-flight fetch or read promptly,
  short-circuits the retry loop without dispatching another attempt, and
  returns one sanitized `Error: Request cancelled` MCP result; unrelated
  concurrent calls continue independently because each call carries its own
  signal and the server imposes no global concurrency limit. The shared
  `src/utils/retry.ts` driver now threads an optional `AbortSignal`
  through `withRetry` (pre-attempt and mid-backoff short-circuit) and
  `withAttemptTimeout` (external-signal composition that aborts the
   per-attempt controller and therefore the in-flight `fetch`).
- End-to-end sentinel-injection redaction and stdio-discipline test suite
  (`src/test/e2e/sanitization.test.ts`) that verifies every runtime
  failure path — startup, image-load, provider 5xx, malformed response,
  per-attempt timeout, and Zod validation — never leaks API keys, model
  names, prompts, image bytes, request-body extras, provider response
  bodies, or URL queries into MCP result text or stdout, and that stdout
  remains purely JSON-RPC protocol traffic. The suite also confirms that
  validation failures gate both image load and provider dispatch (zero
  provider requests) and use the SDK's single `isError: true` text item
  channel with `Input validation error:`-prefixed diagnostic text.

- Added a `partialBodyMs` route mode to
  `src/test/utils/mock-image-server.ts` (mirroring `mock-provider.ts`)
  that writes a 2xx status and the first half of the body, then hangs
  before destroying the socket — simulating a mid-stream body-read
  failure distinct from `hangMs` (which hangs before any body byte).
  Added corresponding tests in
  `src/services/images/images-retry.test.ts`: a server that sends partial
  bytes then aborts produces a retriable `image download failed` after
  exhausting retries (three attempts); a per-attempt timeout firing
  mid-body (short `requestTimeoutMs` against a long `partialBodyMs`)
  classifies as retriable and retries three times; and a caller abort
  landing mid-body short-circuits to `Request cancelled` (with
  `server.aborts === 1`) rather than a retry-exhausted download failure.
  A mock-infrastructure test in
  `src/test/utils/mock-image-server.test.ts` verifies the partial-body
  behavior.

### Changed

- Moved the shared retry and per-attempt timeout driver from
  `src/services/retry.ts` into a new `src/utils/` module with its own
  barrel (`src/utils/index.ts`). Retries and timeouts are cross-cutting
  helpers shared by the provider and image-download services, so they now
  live in `utils/` (shared infrastructure any layer may consume, with no
  upward dependencies) rather than inside `services/`. The provider and
  HTTP image loader import the public symbols (`withRetry`,
  `withAttemptTimeout`, `isTransientStatus`, `AttemptOutcome`) from the
  `utils/` barrel. Updated `AGENTS.md` Project Structure and Architecture
  sections to document the `utils/` module and its dependency rule (it
  MUST NOT import from `services/`, `server/`, or `config/`). The
  colocated `retry.test.ts` moved with the source.
- Co-located each tool's system prompt with the tool definition that
  uses it, removing the `src/services/prompts/` service entirely. Each
  tool file now declares its prompt constant inline; `ui_to_artifact`
  has a dedicated `ui-to-artifact-prompts.ts` sibling for its four
  `output_type` prompts and a `getUiToArtifactPrompt` selector. E2E
  tests import the prompt constants directly from the tool files. The
  `services/` barrel no longer exports `getSystemPrompt`.
- Tool argument schemas no longer call `.strict()`: unknown keys are now
  stripped (accepted) instead of rejected, matching the reference
  `@z_ai/mcp-server`. The emitted JSON Schema still advertises
  `additionalProperties: false` (a `zod-to-json-schema` default), but the
  runtime accepts and discards unexpected fields rather than failing the call.
- Expanded `DEVELOPMENT.md` into a comprehensive developer guide
  covering prerequisites, environment setup, local execution, the
  contribution workflow, common tasks, and troubleshooting.
- Updated `AGENTS.md` to reflect the layered `src/` directory structure
  with barrel exports: rewrote the Project Structure, Architecture, and
  Code Quality sections, documented colocated unit tests in `src/` with
  shared helpers and E2E tests, and removed the `@public` guideline
  (this is an application, not a library).
- Modularized `src/services/` into per-service directories
  (`provider/`, `images/`), each with its own barrel `index.ts` and
  the top-level `services/index.ts` aggregating them.
- Relocated test infrastructure under `src/test/`: shared utilities
  into `src/test/utils/` (with a barrel), end-to-end tests into
  `src/test/e2e/`, and added `src/test/setup.ts` wired into Vitest
  `setupFiles`. Updated Knip, ESLint, and TypeScript configs to
  exclude `src/test/**` from production analysis and apply relaxed
  size limits to test code.
- Replaced the hardcoded base64 PNG in `fixtures/mcp-tester/src/fixtures.ts`
  with per-tool PNG assets loaded at runtime from
  `fixtures/mcp-tester/assets/`. Each of the seven tools now uses an image
  whose subject is relevant to that tool's purpose (a smiley face for
  `analyze_image`, a bar chart for `analyze_data_visualization`, an error
  dialog for `diagnose_error_screenshot`, a "HELLO WORLD" text screenshot
  for `extract_text_from_screenshot`, a login form for `ui_to_artifact`,
  two UI screenshots differing in button color for `ui_diff_check`, and a
  flowchart for `understand_technical_diagram`). The single
  `SAMPLE_PNG_DATA_URL` constant was replaced by a generic
  `pngDataUrl(filename)` loader, and all seven `.case.ts` files were
  updated to request their relevant asset. Images are now swapped by
  replacing a file rather than editing a base64 literal.
- Image loaders now reject content whose declared MIME type (data-URL
  prefix), HTTP `Content-Type` header, or filename extension conflicts
  with the detected image bytes, returning an
  `Error: image declared format does not match its bytes` result without
  dispatching to the provider. Bytes remain authoritative when no
  canonical image MIME is declared.
- Added `expectKeyword(result, keywords)` to `fixtures/mcp-tester/src/
  fixtures.ts` and used it in the live `analyze_image` case. The live
  case now asserts the provider response mentions a content keyword
  (`smile`, `face`, `happy`, `smiley`) instead of merely being
  non-empty, so the test verifies the model actually recognized the
  image content.
- Hardened the provider request composition in
  `src/services/provider/provider.ts` so validated request extras from
  `VISION_MCP_REQUEST_BODY_JSON` merge FIRST and the server-owned `model`,
  `messages`, and `stream: false` always win any key collision. Config-time
  validation in `src/config/config.ts` remains the primary guard; the runtime
  reorder is defense-in-depth so server-owned fields always win key collisions.
- Split `src/server/tools.ts` into a `src/server/tools/` directory with one
  file per tool (`analyze-image.ts`, `ui-to-artifact.ts`,
  `extract-text-from-screenshot.ts`, `diagnose-error-screenshot.ts`,
  `understand-technical-diagram.ts`, `analyze-data-visualization.ts`, and
  the not-yet-implemented `ui-diff-check.ts`) plus a shared `common.ts`
  holding the reused schema primitives, the `Tool` contract, and a single
  `runImageAnalysis` helper that encapsulates the load → analyze →
  map-to-result flow previously duplicated across five handlers.
  `tools/index.ts` now declares one `TOOLS` array that drives both
  registration and the tool catalog, replacing the separate
  not-implemented skip loop and the duplicate explicit registrations.
  The `tools/list` discovery order is unchanged.

- Tool handlers now accept the MCP SDK-supplied `extra` parameter and
  thread `extra.signal: AbortSignal` through `runImageAnalysis` /
  `runDualImageAnalysis` and into `loadImage` / `analyze`. The
  `loadImage`, `loadHttpImage`, `loadFileImage`, `loadDataUrlImage`, and
  `analyze` signatures each gain an optional trailing `signal` parameter
  (backward compatible — existing callers that omit it behave as before).
  A new `ToolHandlerExtra` interface in `src/server/tools/common.ts`
  declares the narrow `{ signal }` shape the handlers consume, keeping SDK
  imports localized.

- `ui_diff_check` now loads its expected and actual image sources
  concurrently via `Promise.all` in `runDualImageAnalysis` (extracted into
  a `loadBothImages` helper in `src/server/tools/common.ts`), roughly
  halving dual-HTTP-image latency. A local `AbortController` propagates an
  external cancel to both loads and cancels the in-flight peer when one
  source is invalid, so an invalid expected source does not strand a
  pending actual download; the external `signal` itself is never aborted
  on a validation failure (only the local controller is), so the first
  rejection's message reaches the caller unaltered. The atomic invariant
  is preserved: the provider is contacted only after both images
  byte-validate, and the two images are still sent in expected-first /
  actual-second order.

- Renamed the non-throwing `assertHttpSchemeResult` helper in
  `src/services/images/http-image.ts` to `httpSchemeError` so its name
  reflects its result-returning contract (`string | undefined`); the
  `assert*` prefix is reserved for the throwing siblings in `format.ts`.

- Extended `src/test/utils/stdio-rpc.ts` with `sendNotification(child,
  method, params?)` and `cancel(child, requestId)` (sends
  `notifications/cancelled`) helpers, and added an `aborts: number`
  counter to `MockProvider` and `MockImageServer` that increments when a
   request's `req` closes before the response has been sent (client gave
   up mid-response).

- Removed dead `notImplementedToolResult` from `src/config/errors.ts`.
  All seven tools are now active, so the "not yet implemented" path is
  obsolete and had zero production callers. The corresponding unit test was
  removed from `src/config/errors.test.ts`.

- Added a catalog-driven `errorToolResult` single-item contract test in
  `src/config/errors.test.ts` covering all 18 curated error messages
  produced by the image-load, HTTP-download, provider, retry, and
  cancellation paths. Every case asserts exactly one text content item
  with `isError: true` and an `Error:` prefix — a characterization
  lock-in for the centralized failure-conversion chokepoint.

- Hardened the HTTP image-download body reader in
  `src/services/images/http-image.ts` so `readBoundedBody` returns an
  `AttemptOutcome<{ bytes: Buffer }>` directly, classifying oversize as a
  permanent (`retriable: false`) outcome and a mid-stream read error as a
  transient (`retriable: true`) outcome at the failure site. Removed the
  intermediate `attemptDownloadBytes` wrapper, which previously re-derived
  the retriable flag by regex-matching the thrown error message
  (`/size limit/.test(message)`); that stringly-typed coupling meant a
  future message rewording would silently misclassify a permanent
  validation failure as retriable. Every classification site in the
  module now constructs the outcome directly, matching the established
  `AttemptOutcome` contract.
- Introduced a shared `CANCELLED_MESSAGE` constant in
  `src/utils/retry.ts` (re-exported by the `utils/` barrel) as the single
  source of truth for the cancellation outcome message. The retry driver,
  the image loader (`images.ts`), the HTTP image loader
  (`http-image.ts`), and the provider (`provider.ts`) all reference the
  constant at their 11 throw/`message:` sites instead of duplicating the
  `'Request cancelled'` literal, so the curated cancellation message
  cannot drift across layers.

### Fixed

- A caller cancellation landing between the provider response headers and a
  fully-parsed body now surfaces as `Error: Request cancelled` instead of a
  misleading `Error: malformed provider response`. The `response.json()`
  catch in `attemptProviderRequest` now checks the external signal and
  short-circuits to the permanent cancellation outcome, mirroring the
  existing `fetch` catch and matching the HTTP image-download path. Added a
  `partialBodyMs` mode to the mock provider and a mid-body cancellation
  test in `src/services/provider/provider-retry.test.ts`.
- A per-attempt timeout firing while `response.json()` reads a 2xx body
  (the "hung provider returns headers then stalls mid-body" case) now
  surfaces as a retriable `Error: provider request failed` instead of a
  permanent `Error: malformed provider response`. The `response.json()`
  catch in `attemptProviderRequest` now also checks the composed fetch
  signal and classifies a per-attempt timeout as retriable, mirroring the
  existing `fetch` catch and the HTTP image-download path, so a hung
  provider after headers consumes the retry budget the policy promises
  (three total attempts) rather than failing after one. Added a mid-body
  timeout test in `src/services/provider/provider-retry.test.ts`.
- Refreshed stale `doRequest` references in the `runImageAnalysis` and
  `runDualImageAnalysis` JSDoc in `src/server/tools/common.ts` to the
  current `attemptProviderRequest` name.
- Narrowed the HTTP image-download redirect detection in
  `src/services/images/http-image.ts` to the Location-bearing redirect
  codes (301, 302, 303, 307, 308) — the same set `fetch` follows —
  instead of the full 3xx range, so a non-redirect 3xx response (e.g.
  304 Not Modified from a misconfigured cache or proxy) falls through to
  body validation instead of failing with a misleading
  `image redirect is missing a location`.
- Removed stale duplicate test files that imported the old flat
  `src/*.ts` layout, and corrected broken imports surfaced during the
  test relocation. The suite now passes end to end.
