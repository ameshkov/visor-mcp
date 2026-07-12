# Changelog

## Unreleased

### Added

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

### Changed

- Expanded `DEVELOPMENT.md` into a comprehensive developer guide
  covering prerequisites, environment setup, local execution, the
  contribution workflow, common tasks, and troubleshooting.
- Updated `AGENTS.md` to reflect the layered `src/` directory structure
  with barrel exports: rewrote the Project Structure, Architecture, and
  Code Quality sections, documented colocated unit tests in `src/` with
  shared helpers and E2E tests, and removed the `@public` guideline
  (this is an application, not a library).
- Modularized `src/services/` into per-service directories
  (`provider/`, `images/`, `prompts/`), each with its own barrel
  `index.ts` and the top-level `services/index.ts` aggregating them.
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
- Added `expectKeyword(result, keywords)` to `fixtures/mcp-tester/src/
  fixtures.ts` and used it in the live `analyze_image` case. The live
  case now asserts the provider response mentions a content keyword
  (`smile`, `face`, `happy`, `smiley`) instead of merely being
  non-empty, so the test verifies the model actually recognized the
  image content.

### Fixed

- Removed stale duplicate test files that imported the old flat
  `src/*.ts` layout, and corrected broken imports surfaced during the
  test relocation. The suite now passes end to end.
