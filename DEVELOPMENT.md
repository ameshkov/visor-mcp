# Development

This guide is for developers setting up the `vision-mcp` repository for
the first time. It covers environment setup, local execution, the
contribution workflow, and common tasks. For architecture and code
guidelines, see [AGENTS.md](AGENTS.md); for the operator guide
(installation, configuration, tools, data flow, security), see
[README.md](README.md). `README.md` is operator-facing while
`DEVELOPMENT.md` is developer-facing.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
    - [Clone and Install Dependencies](#clone-and-install-dependencies)
    - [Configure the Environment](#configure-the-environment)
    - [Run the Server](#run-the-server)
- [Development Workflow](#development-workflow)
    - [Quality Gate](#quality-gate)
    - [Branching and Pull Requests](#branching-and-pull-requests)
    - [Code Style and Conventions](#code-style-and-conventions)
    - [Testing](#testing)
- [Common Tasks](#common-tasks)
    - [Available Scripts](#available-scripts)
    - [Run from Source](#run-from-source)
    - [Run the E2E MCP Tester](#run-the-e2e-mcp-tester)
    - [Editor Configuration](#editor-configuration)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## Prerequisites

Install the following before starting:

- **Node.js 24 or later** — required by `package.json` `engines` and used
  by CI. Download it from https://nodejs.org or use a version manager
  such as `fnm` or `nvm`.
- **pnpm 10 or later** — the only supported package manager. The version
  is pinned to `pnpm@10.14.0` in the `packageManager` field. Enable it
  with Corepack, which then resolves the pinned version automatically:

  ```bash
  corepack enable
  ```

- **Git** — for cloning and contributing.
- **An OpenAI-compatible vision provider** — you need an API key, a base
  URL, and a model name to run the server against a real provider.

## Getting Started

### Clone and Install Dependencies

```bash
git clone <repository-url> vision-mcp
cd vision-mcp
pnpm install
```

`pnpm install` reads the lockfile and installs everything needed to
run, build, lint, and test the project.

### Configure the Environment

The server reads configuration from environment variables. A `.env`
file in the current working directory is auto-loaded by `dotenv` at
startup; process environment variables take precedence over `.env`
file values. The `.env` file is gitignored — never commit secrets.

There is no `.env.example` at the repository root, so create the file
yourself:

```bash
VISION_MCP_API_KEY=your-api-key
VISION_MCP_BASE_URL=https://api.openai.com/v1
VISION_MCP_MODEL=gpt-4o
# Optional:
# VISION_MCP_MAX_IMAGE_SIZE_MB=5
# VISION_MCP_REQUEST_TIMEOUT_MS=60000
# VISION_MCP_REQUEST_BODY_JSON={"temperature":0.2}
```

Required variables:

| Variable | Description |
| --- | --- |
| `VISION_MCP_API_KEY` | API key for the provider |
| `VISION_MCP_BASE_URL` | Provider base URL (http or https) |
| `VISION_MCP_MODEL` | Model name used for vision calls |

Optional variables:

| Variable | Default | Description |
| --- | --- | --- |
| `VISION_MCP_MAX_IMAGE_SIZE_MB` | `5` | Maximum accepted image size in MB |
| `VISION_MCP_REQUEST_TIMEOUT_MS` | `60000` | Per-attempt timeout in ms applied independently to each provider request and each HTTP image download (not a total-call timeout — each retry attempt gets a fresh timer) |
| `VISION_MCP_REQUEST_BODY_JSON` | `{}` | Extra JSON merged into the request body (cannot set `model`, `messages`, or `stream`) |

If a required variable is missing or invalid, the server exits with
code `1` and writes a diagnostic to stderr.

### Run the Server

Build the project, then run the compiled entry point over stdio:

```bash
pnpm build
node build/index.js
```

The server speaks the MCP JSON-RPC protocol over stdio. On success it
starts silently and waits for client input — there is no startup log.
Diagnostics and errors are written to stderr; stdout is reserved for
protocol messages, so never add `console.log` calls in the server
path.

To use the server from an MCP client, configure the client to launch:

- **Command:** `node`
- **Args:** `["build/index.js"]` (or an absolute path to it)
- **Working directory:** the repository root, so `.env` is found

For iterative development without rebuilding, see
[Run from Source](#run-from-source).

## Development Workflow

### Quality Gate

Every change must pass the full quality gate before merge:

```bash
pnpm check
```

`pnpm check` runs formatting checks, ESLint plus Knip, the TypeScript
typecheck (production and test code), and the test suite. A pre-commit
hook (`.husky/pre-commit`) runs `pnpm check` automatically before each
commit. CI (`.github/workflows/ci.yml`) runs `pnpm check && pnpm build`
on Ubuntu with Node.js 24 for every push and pull request.

### Branching and Pull Requests

- Branch from the default branch and open a pull request against it.
- Keep pull requests focused — one logical change per request.
- Run `pnpm check && pnpm build` locally before pushing.
- Update [CHANGELOG.md](CHANGELOG.md) under the **Unreleased** section
  for any user-facing change, using the appropriate subsection
  (**Added**, **Changed**, or **Fixed**).

### Code Style and Conventions

Architecture, formatting, file-size limits, JSDoc requirements, Knip
rules, and all other code conventions are defined in
[AGENTS.md](AGENTS.md). Read it before contributing. Auto-fix common
issues with:

```bash
pnpm format:fix
pnpm lint:fix
```

Do not modify the linter or formatter configurations to work around
errors — fix the source instead.

### Testing

Tests use [Vitest](https://vitest.dev) and the `.test.ts` suffix. Unit
tests are colocated with their source in `src/`; shared test
infrastructure (`src/test/utils/`) and end-to-end tests over stdio
(`src/test/e2e/`) live under `src/test/`. The suite prefers integration
tests backed by mock HTTP servers over heavy unit mocks. Run the suite
with:

```bash
pnpm test
pnpm test:watch
```

Test file placement, shared utilities, and integration test
conventions are described in [AGENTS.md](AGENTS.md#testing).

## Common Tasks

### Available Scripts

All scripts are defined in `package.json`. Run them with
`pnpm <name>`.

| Script | Description |
| --- | --- |
| `check` | Full CI gate: `format:check`, `lint`, `typecheck`, `test` |
| `build` | Compile TypeScript to `build/` and make `build/index.js` executable |
| `typecheck` | Run `tsc`, then `tsc -p tsconfig.test.json` |
| `test` | Run `vitest run` |
| `test:watch` | Run Vitest in watch mode |
| `lint` | Run `eslint src`, then Knip |
| `lint:fix` | Run `eslint src --fix` |
| `knip` | Run Knip unused-export analysis |
| `format:check` | Run `prettier --check .`, then `markdownlint-cli2 .` |
| `format:fix` | Run `prettier --write .`, then `markdownlint-cli2 --fix .` |
| `clean` | Remove `node_modules` and `build/` |

### Run from Source

Run the TypeScript server directly with `tsx`, skipping the build step:

```bash
node --import tsx src/index.ts
```

This requires dev dependencies (`tsx`) and reads the same `.env` file.
Use it for quick iteration; use `node build/index.js` for a production
build or for MCP clients.

### Run the E2E MCP Tester

The `fixtures/mcp-tester/` sub-project is a self-contained pnpm project
that spawns the server, connects an MCP `Client` over stdio, discovers
tools, and runs one `.case.ts` fixture per tool. The server must be
built first (`pnpm build` from the repo root) so `build/index.js`
exists. See
[fixtures/mcp-tester/README.md](fixtures/mcp-tester/README.md) for
full setup. From inside that directory:

```bash
pnpm install
cp .env.example .env   # then fill in provider config
pnpm start             # run non-live cases
pnpm start:live        # also run live provider calls
pnpm typecheck
```

### Debug the MCP Server

You can debug the vision-mcp server through `mcp-tester` from VSCode by
relying on the tester's full env forwarding (`serverEnv()` in
`fixtures/mcp-tester/src/config.ts`): a `launch.json` with
`autoAttachChildProcesses: true` auto-attaches to the spawned server as
well. The shared `launch.json` is intentionally not committed (`.vscode/`
is gitignored), so copy the configuration documented in
[fixtures/mcp-tester/README.md](fixtures/mcp-tester/README.md#debugging)
into a local `.vscode/launch.json` at the repository root, set a
breakpoint in `src/`, and press F5.

### Editor Configuration

The repository does not commit editor configuration (`.vscode/` is
gitignored). Recommended setup:

- Install the ESLint and Prettier extensions.
- Enable **format on save** with Prettier as the formatter.
- The project uses single quotes, trailing commas, and a 100-character
  print width (see [`.prettierrc`](.prettierrc)).

## Troubleshooting

- **`Startup failed: invalid configuration`** — a required environment
  variable is missing or invalid. Ensure `VISION_MCP_API_KEY`,
  `VISION_MCP_BASE_URL`, and `VISION_MCP_MODEL` are set in your
  `.env`. `VISION_MCP_BASE_URL` must be a valid `http`/`https` URL.
- **The server starts but seems to hang** — this is expected. The server
  speaks JSON-RPC over stdio and waits for client input on stdin. Drive
  it with an MCP client or the E2E tester rather than typing into the
  terminal.
- **Pre-commit hook fails** — run `pnpm check` to see the failing step.
  Auto-fix what you can with `pnpm format:fix` and `pnpm lint:fix`,
  then rerun `pnpm check`.
- **Knip reports an unused export** — remove the export, or tag it with
  `@internal` (test-only) following the rules in
  [AGENTS.md](AGENTS.md#code-quality).
- **`pnpm` is not found or is the wrong version** — the project requires
  pnpm 10+. Run `corepack enable` to use the version pinned in
  `packageManager` (`pnpm@10.14.0`).
- **TypeScript build errors** — run `pnpm typecheck` for a focused view
  of type errors across production and test code.

## Additional Resources

- [AGENTS.md](AGENTS.md) — architecture, code guidelines, project
  structure.
- [README.md](README.md) — project overview.
- [CHANGELOG.md](CHANGELOG.md) — release history.
- [fixtures/mcp-tester/README.md](fixtures/mcp-tester/README.md) — E2E
  tester setup and usage.
- https://modelcontextprotocol.io — Model Context Protocol documentation.
