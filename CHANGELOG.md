# Changelog

## Unreleased

### Added

- Every tool parameter now carries a `description` that is emitted into the
  tool input schema, so clients receive per-field guidance via `tools/list`.
  String parameters use a new `nonWhitespaceField(description)` factory that
  returns a fresh, described schema per field (no cross-field `$ref`
  deduplication) while preserving the non-empty, non-whitespace validation.
- Expanded every tool-level `description` into a structured multi-paragraph
  contract with `Use this tool ONLY when ...` and `Do NOT use for: ...`
  sections, matching the reference `@z_ai/mcp-server` style.
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
  field protection at the composition layer, every PRD-required response
  normalization variant (string, fragmented text, mixed text/non-text,
  refusal-only, tool-calls-only, audio-only, empty choices, missing
  choices, non-object body), sanitized error containment for 5xx and
  malformed-response paths, and the non-retry property for malformed first
  choices.

### Changed

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
  reorder is defense-in-depth matching PRD User Story 6 acceptance scenario 4.
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

### Fixed

- Removed stale duplicate test files that imported the old flat
  `src/*.ts` layout, and corrected broken imports surfaced during the
  test relocation. The suite now passes end to end.
