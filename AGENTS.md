# AGENTS.md

Vision MCP is an MCP server for providing vision capabilities to text-only
models through OpenAI-compatible providers. The implementation is intentionally
minimal at this stage; future work will add the server tools and provider
integration.

## Technical Context

| Field | Value |
| --- | --- |
| Language | TypeScript 5.9, ES2022 target, strict mode |
| Runtime | Node.js 24+ |
| Package manager | pnpm 10+ |
| Protocol | Model Context Protocol (MCP) |
| Transport | stdio |
| Linting | ESLint 9.x + typescript-eslint + Knip |
| Formatting | Prettier 3.x + Markdownlint |

## Project Structure

```text
vision-mcp/
├── src/
│   └── index.ts              # MCP server entry point (currently a stub)
├── test/                     # Unit and integration tests
├── .github/workflows/ci.yml  # Quality gates and build
├── AGENTS.md                 # Instructions for coding agents
├── eslint.config.mjs         # ESLint flat configuration
├── knip.config.ts            # Unused-code analysis configuration
├── package.json              # Package metadata and scripts
├── tsconfig.json             # Production TypeScript configuration
├── tsconfig.test.json        # Test TypeScript configuration
└── vitest.config.ts          # Vitest configuration
```

As implementation grows, keep the entry point focused on MCP server setup and
transport wiring. Put tool handlers, provider integrations, and shared helpers
in separate modules with narrow responsibilities. Keep provider-specific logic
behind an explicit service boundary so it can be tested independently from MCP
transport concerns.

## Build and Test Commands

- `pnpm install` - install dependencies from the lockfile
- `pnpm build` - compile TypeScript to `build/`
- `pnpm typecheck` - check production and test TypeScript
- `pnpm lint` - run ESLint and Knip
- `pnpm format:check` - check Prettier and Markdownlint
- `pnpm test` - run Vitest tests
- `pnpm check` - run the complete quality gate
- `pnpm clean` - remove dependencies and build output

Every change must pass `pnpm check` and `pnpm build`. Add or update focused
tests whenever behavior changes.

## Code Guidelines

- Keep the server on stdio; never write diagnostic output to stdout because it
  is reserved for MCP protocol messages. Use stderr for diagnostics.
- Use strict TypeScript and validate external input at module boundaries.
- Keep MCP request handling separate from provider API calls and response
  normalization.
- Prefer small, explicit modules over speculative abstractions.
- Use existing scripts and dependencies before adding new tooling.
- Do not commit secrets, provider credentials, or local environment files.
- Keep public package metadata and documentation aligned with implemented
  behavior.
