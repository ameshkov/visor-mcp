# AGENTS.md

Vision MCP is an MCP server that provides vision capabilities to
text-only models through OpenAI-compatible providers. It exposes seven
tools for image analysis, with `analyze_image` fully implemented and six
specialized tools reserved for future work.

## Table of Contents

- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build and Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
    - [Architecture](#architecture)
    - [Code Quality](#code-quality)
    - [Testing](#testing)
    - [Dependency Management](#dependency-management)
    - [Configuration & Documentation](#configuration--documentation)
    - [Markdown Formatting](#markdown-formatting)

## Project Overview

Vision MCP is a Model Context Protocol server that adds vision
capabilities to text-only LLMs by forwarding image-analysis requests to
an OpenAI-compatible Chat Completions endpoint. Instead of every model
needing native vision support, this server acts as a proxy: it accepts
an image source (data URL, HTTP/HTTPS URL, or absolute file path) and a
prompt, sends both to the provider, and returns the text response.

## Technical Context

| Field | Value |
| --- | --- |
| Language | TypeScript 5.9, ES2022 target, strict mode |
| Runtime | Node.js 24+ |
| Package Manager | pnpm 10+ |
| Framework | MCP SDK (`@modelcontextprotocol/sdk`) |
| Linting | ESLint 9.x + typescript-eslint + Knip |
| Formatting | Prettier 3.x, Markdownlint (markdownlint-cli2) |
| Project Type | MCP server (stdio transport) |

## Project Structure

```text
vision-mcp/
├── src/
│   ├── index.ts          # Entry point: load config, create server, start stdio
│   ├── config/           # Config loading + error formatting
│   ├── server/           # MCP server creation + tool handlers
│   ├── services/         # Provider, images, prompts — each its own directory
│   │   ├── images/       # Image loading and validation
│   │   ├── prompts/      # System prompts for LLM tools
│   │   └── provider/     # OpenAI-compatible provider API integration
│   └── test/             # Test infrastructure colocated with source
│       ├── e2e/          # End-to-end tests over stdio
│       ├── utils/        # Shared test helpers (mock servers, fixtures)
│       └── setup.ts      # Shared test setup run by Vitest
├── fixtures/mcp-tester/  # Standalone E2E fixture runner (own pnpm project)
├── .github/workflows/ci.yml   # Quality gate + build
├── .husky/pre-commit          # Pre-commit hook running quality gate
├── eslint.config.mjs          # ESLint flat configuration
├── knip.config.ts             # Knip unused-export analysis configuration
├── package.json               # Project dependencies and scripts
├── tsconfig.json              # TypeScript configuration (production)
├── tsconfig.test.json         # TypeScript configuration (tests, noEmit)
└── vitest.config.ts           # Vitest configuration
```

Each `src/` subdirectory groups related modules behind a barrel
`index.ts` that defines its public API. Each service under `services/`
encapsulates all its functionality in its own directory with a barrel;
the top-level `services/index.ts` aggregates them into one public API.
Unit tests are colocated with their source (e.g.,
`src/services/images/images.test.ts` next to
`src/services/images/images.ts`). Shared test infrastructure and
end-to-end tests live under `src/test/`.

## Build and Test Commands

- `pnpm install` — install dependencies from the lockfile
- `pnpm build` — compile TypeScript to `build/` and make executable
- `pnpm typecheck` — check for TypeScript type errors in production and
  test code
- `pnpm lint` — lint source files with ESLint and check for unused
  exports with Knip
- `pnpm lint:fix` — lint and auto-fix issues
- `pnpm knip` — run Knip unused-export analysis separately
- `pnpm format:check` — check formatting with Prettier and Markdownlint
- `pnpm format:fix` — fix formatting issues
- `pnpm test` — run Vitest tests
- `pnpm test:watch` — run Vitest in watch mode
- `pnpm check` — run `format:check`, `lint`, `typecheck`, and `test`
  (full CI gate)
- `pnpm clean` — remove `node_modules` and `build/`

The `fixtures/mcp-tester/` sub-project is a self-contained pnpm project
that runs E2E fixtures against the server. Its own commands (`pnpm start`,
`pnpm start:live`, `pnpm typecheck`) run from inside that directory; see
`fixtures/mcp-tester/README.md` for setup and usage.

## Contribution Instructions

You MUST follow the following rules for EVERY task that you perform:

- You MUST verify it with linter, formatter, and TypeScript compiler.
  Use the following commands:
    - `pnpm typecheck` to check for TypeScript type errors
    - `pnpm lint` to run the linter (ESLint) and Knip unused-export
      analysis
    - `pnpm lint:fix` to fix linting issues that can be fixed
      automatically
    - `pnpm format:check` to check the formatting (Prettier and
      Markdownlint)
    - `pnpm format:fix` to fix the formatting issues
- When making changes to the project structure, ensure the Project
  Structure section in `AGENTS.md` is updated and remains valid.
- If the prompt essentially asks you to refactor or improve existing
  code, check if you can phrase it as a code guideline. If it's possible,
  add it to the relevant Code Guidelines section in `AGENTS.md`.
- You MUST update the unit tests for changed code.
- You MUST run tests with the `pnpm test` script to verify that your
  changes do not break existing functionality.
- After completing the task you MUST verify that the code you've written
  follows the Code Guidelines in this file.
- When the coding task is finished update `CHANGELOG.md` and explain
  changes in the Unreleased section. Add entries to the appropriate
  subsection (Added, Changed, or Fixed) if it already exists; do not
  create duplicate subsections.

## Code Guidelines

### Architecture

Universal design principles this codebase follows:

- **Separation of Concerns** — each module handles one aspect of the
  system (e.g., `services/` for provider calls and image loading,
  `config/` for configuration).
- **Single Responsibility Principle** — every file, class, or function
  has one reason to change.
- **Dependency Direction** — higher layers may depend on lower layers,
  never the reverse (e.g., `server/` may import `services/` and
  `config/`; `config/` may not import `server/` or `services/`). See
  the layer diagram below.
- **Explicit Boundaries** — module interfaces are intentional; each
  `src/` subdirectory exposes a barrel `index.ts` that defines its
  public API. External code MUST import from barrels only. Do not
  create circular dependencies between modules.
- **Data Flow Clarity** — data moves through the system in a
  predictable, traceable path (entry point → server → services →
  config).
- **Minimize Coupling, Maximize Cohesion** — modules are self-contained
  and interact through narrow interfaces.
- **Make Invalid States Impossible** — use TypeScript strict mode and
  validation to prevent illegal combinations at compile time.
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.

The project uses a layered architecture across `src/` subdirectories.
Each directory exposes a barrel `index.ts` defining its public API.
The layers, from top to bottom:

- **Entry point** (`src/index.ts`) — loads configuration, creates the
  MCP server, and starts the stdio transport. Owns top-level error
  catching.
- **Server** (`src/server/`) — creates the `McpServer` instance,
  registers tool handlers, and wires the `StdioServerTransport`.
  Tool handlers define Zod schemas and delegate to services; no
  business logic beyond orchestration.
- **Services** (`src/services/`) — vision provider calls, image loading,
  and system prompts. Each service is its own subdirectory
  (`provider/`, `images/`, `prompts/`) with a barrel `index.ts` that
  encapsulates all its functionality; the top-level `services/index.ts`
  aggregates them into one public API. Provider-specific logic lives
  here so it can be tested independently of MCP transport concerns.
- **Config** (`src/config/`) — infrastructure: configuration loading
  from environment variables and a `.env` file, plus error formatting
  and startup diagnostics.

```text
Entry point (index.ts)
    ↓
Server (server/)
    ↓
Services (services/) / Config (config/)
```

Tool handlers receive only the `ServerConfig`: the entry point loads
configuration and passes it through `createServer` to `registerTools`.
Tool handlers MUST NOT receive transport clients, raw server
connections, or provider HTTP clients. These are implementation
details wired inside the modules they belong to.

### Code Quality

All code MUST meet documentation and style requirements before merge:

- **Public API documentation**: Exported functions, classes, interfaces,
  and their properties MUST have JSDoc comments describing purpose,
  arguments, return values, and thrown errors (use `@throws` only for
  specific errors).
- **Static analysis gates**: Every change MUST pass TypeScript
  compilation (`pnpm typecheck`), ESLint (`pnpm lint`), and
  Prettier/Markdownlint (`pnpm format:check`) before merge.
- **Do not modify linter or formatter configurations**: Never change
  ESLint, Prettier, Markdownlint, or TypeScript configuration files
  (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
  `.markdownlint-cli2.yaml`, `tsconfig.json`, `tsconfig.test.json`) to
  work around lint or formatting errors. Fix the source code instead.
  If the issue cannot be resolved after a few attempts, ask the human
  for help.
- **Error handling strategy**: Prefer throwing errors over returning
  error values. Handle errors at top-level entry points where they can
  be logged. Tool handlers return `CallToolResult` with `isError: true`
  for user-facing errors rather than throwing.
- **File naming**: Use kebab-case for all file names. TypeScript source
  files MUST use lower-case kebab-case. Do NOT use PascalCase or
  camelCase file names.
- **Knip unused-export analysis**: The project uses Knip
  (`knip.config.ts`) to detect unused exports. All Knip findings MUST be
  resolved — either remove the unused export or, when the export is
  genuinely needed but not reachable through the public dependency
  graph, mark it with the JSDoc `@internal` tag. The `@internal` tag is
  allowed **only** when a symbol is exported solely for test files and
  is intentionally **not** part of the module's public API. Every
  `@internal` tag MUST include a short explanation of why the export is
  excluded (e.g., "Exported for tests only; not part of the public
  module API"). Do NOT use `@internal` to silence legitimate
  unused-export warnings — remove the export instead.
- **File size limit**: Source files MUST stay within 300 lines of
  code. This is an enforced ESLint `max-lines` gate (`'error'`
  severity, `max: 300`; blank lines and comments are skipped) — a hard
  gate, not a soft target. When a file approaches or exceeds this
  limit, your FIRST and default response MUST be to **split the file
  into several smaller, cohesive files**, each with a single, clear
  responsibility (extract related functions, types, or constants into
  dedicated modules and update imports accordingly). Treat the limit
  as a signal that the file is doing too much, not as a quota to
  optimize against. You MUST attempt a split before any other tactic;
  only fall back if you can articulate a concrete reason a split would
  hurt clarity. For test files, the `max-lines` gate is raised to 500
  (and `max-lines-per-function` is disabled); split a large `*.test.ts`
  into multiple focused `*.test.ts` files grouped by the behavior they
  verify — multiple test files per source module are explicitly
  allowed. **Do NOT** satisfy the limit by making the existing code
  shorter: no condensing tests into table-driven blocks purely to save
  lines, no shortening of identifiers, string literals, or file paths,
  no merging statements onto one line, and no removing blank lines,
  comments, or JSDoc. Formatting is managed by Prettier and must stay
  uniform — readability and clarity always win over line count.
  Exceptions: auto-generated files and database migration files.
- **Function size limit**: Functions SHOULD stay within 50 lines of
  code. When approaching or exceeding this limit, break the function
  into smaller, named helper functions with single, clear
  responsibilities. **Do NOT** condense logic into dense one-liners,
  inline multiple statements on a single line, or strip whitespace to
  fit the limit — formatting is managed by Prettier and must not be
  sacrificed for brevity. Exceptions: auto-generated files and database
  migration files.

**Rationale**: Consistent documentation and tooling enforcement prevents
technical debt accumulation and ensures codebase navigability.

### Testing

Every module MUST have test coverage:

- **Test file placement**: Test files are colocated with their source
  in `src/` and MUST use the `.test.ts` suffix (e.g.,
  `src/services/images/images.test.ts` next to
  `src/services/images/images.ts`). Use the source file name as the
  base for the test file name. Multiple test files per source module
  are allowed.
- **Shared test utilities**: Common test infrastructure (mock HTTP
  servers, stdio protocol helpers, fixture data) lives in
  `src/test/utils/` (with a barrel `index.ts`). These files MUST NOT
  use the `.test.ts` suffix — they are test support code, not test
  cases.
- **Shared test setup**: Global setup that applies to every test file
  lives in `src/test/setup.ts`, wired into Vitest via `setupFiles`.
- **End-to-end tests**: Integration tests that exercise the full server
  over stdio live in `src/test/e2e/` (e.g.,
  `src/test/e2e/stdio.test.ts` and `src/test/e2e/analyze-image.test.ts`
  spawn the server as a child process and communicate using the MCP
  JSON-RPC protocol).
- **Test verification mandatory**: All changes MUST pass `pnpm test`
  before merge. Tests MUST NOT be deleted or weakened without explicit
  justification.
- **Use real integrations where practical**: Integration tests use mock
  HTTP servers (`startMockProvider`, `startMockImageServer` exported
  from `src/test/utils/`) that simulate real provider responses. Prefer
  integration-style tests that exercise real components over mock-heavy
  unit tests.

**Rationale**: Colocating tests with source keeps related files close,
making it easier to find, update, and maintain tests. Testing against
real components catches bugs that mocks hide (transport issues,
protocol mismatches, serialization errors) and gives higher confidence
in the system's actual behavior.

### Dependency Management

- **Pin all dependency versions explicitly**: Do not use `^` or `~` in
  `package.json`.

External dependencies MUST be carefully evaluated before adoption:

- **Prefer vanilla solutions**: Use Node.js built-in APIs and standard
  language features when they adequately solve the problem. Only add a
  dependency when it provides significant value over a vanilla
  implementation.
- **Reputable sources only**: Dependencies MUST come from
  well-established, actively maintained projects. Evaluate by: weekly
  downloads (prefer >100k), GitHub stars, recent commit activity, and
  known maintainers.
- **Avoid unpopular libraries**: Do NOT add niche or obscure packages
  with limited community adoption. These pose security risks and may
  become unmaintained.
- **Minimize dependency count**: Each new dependency increases attack
  surface, bundle size, and maintenance burden. Justify every addition.
- **Use the latest stable version**: When adding a new dependency,
  explicitly check the package registry for the latest stable release
  and use it. Do not copy outdated version numbers from memory,
  training data, or existing lock files of other projects.

**Rationale**: Fewer, well-vetted dependencies reduce security
vulnerabilities, supply chain risks, and long-term maintenance costs.

### Configuration & Documentation

Configuration and documentation MUST stay synchronized with code:

- **Documentation updates required**: Changes to build process or
  configuration MUST update relevant documentation
  (`DEVELOPMENT.md`, `README.md`).
- **Structure tracking**: Changes to project structure MUST update the
  Project Structure section in `AGENTS.md`.
- **Environment-based configuration**: Server configuration is loaded
  from environment variables. A `.env` file in cwd is auto-loaded by
  `dotenv` at startup — secrets should go there, not in committed
  files. Process environment always takes precedence over `.env`. The
  `.env` file is gitignored.

**Rationale**: Stale documentation causes onboarding friction and
operational incidents.

### Markdown Formatting

All Markdown files MUST follow these formatting rules:

- **Line length**: Keep lines at most 80 characters. This is not a hard
  lint gate, but SHOULD be followed for readability. Lines inside fenced
  code blocks are exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent
  nested list items by 4 spaces.
- **Emphasis**: Use asterisks (`*`) for emphasis (`*italic*`,
  `**bold**`). Do NOT use underscores.
- **Headings**: Duplicate heading names are allowed only among sibling
  headings (same parent level). Avoid duplicates across different
  levels.
- **Inline HTML**: Avoid raw HTML in Markdown. The only allowed
  elements are `<a>`, `<p>`, `<details>`, `<summary>`, and `<img>`.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line. Do
  NOT use two-space line breaks — use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need to be wrapped
  in angle brackets.
- **Table formatting**: Align table columns with padding when the table
  fits within 80 characters. If the table exceeds 80 characters or
  triggers an MD060 linter warning, switch to a compact format using
  single spaces only. This applies to the separator row as well — it
  should be written as `| --- |`, not `|--|`.

  Example of correct layout:

  ```markdown
  | Col1 | Col2 |
  | --- | --- |
  | Value1 | Value2 |
  ```

  Do NOT use extra padding or alignment characters beyond single spaces.

**Rationale**: Uniform Markdown formatting improves readability for both
humans and AI agents that consume project documentation.
