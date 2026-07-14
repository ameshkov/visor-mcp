# mcp-tester

End-to-end fixture runner for the `vision-mcp` server. It spawns the server
as a child process, connects an MCP SDK `Client` over stdio (the same library
approach the [MCP Inspector][inspector] uses internally), discovers the
advertised tools, and runs one TypeScript fixture per tool.

[inspector]: https://github.com/modelcontextprotocol/inspector

## What it does

1. Loads configuration from `.env` (dotenv).
2. Spawns the vision-mcp server with the resolved environment.
3. Connects an MCP `Client` over `StdioClientTransport`.
4. Calls `client.listTools()` to discover every advertised tool.
5. Imports every `cases/*.case.ts` file and runs each fixture's cases
   against the matching tool.
6. Prints a per-tool summary and exits `0` on success, `1` on any failure.

## Prerequisites

- Node.js 24 or later
- The parent `vision-mcp` repository built at `build/index.js` (run
  `pnpm build` from the repo root), or override the launch command via
  `MCP_TESTER_SERVER_*`.

## Setup

From the `fixtures/mcp-tester/` directory:

```bash
pnpm install
cp .env.example .env
# Fill in VISION_MCP_API_KEY, VISION_MCP_BASE_URL, VISION_MCP_MODEL in .env
```

The `.env` file is the single source of truth for both the tester and the
spawned server: the tester loads it with dotenv and forwards every
`VISION_MCP_*` value to the server process, so the server does not need its
own `.env`.

## Running

```bash
pnpm start
```

This runs every non-live case. To also run cases that make real provider
calls (gated with `live: true` in their fixture):

```bash
pnpm start:live
# or: MCP_TESTER_LIVE=1 pnpm start
```

## Configuration

All values are read from `.env` (or the process environment, which takes
precedence). Server settings (`VISION_MCP_*`) are forwarded to the spawned
server unchanged.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VISION_MCP_API_KEY` | (none) | Provider API key forwarded to the server. |
| `VISION_MCP_BASE_URL` | (none) | Provider base URL forwarded to the server. |
| `VISION_MCP_MODEL` | (none) | Model name forwarded to the server. |
| `MCP_TESTER_SERVER_COMMAND` | `node` | Executable used to launch the server. |
| `MCP_TESTER_SERVER_ARGS` | `build/index.js` | Args for the command. JSON array or whitespace-separated. |
| `MCP_TESTER_SERVER_CWD` | repo root | Working directory for the spawned server. |
| `MCP_TESTER_FIXTURES_DIR` | `cases` | Directory holding `.case.ts` files. |
| `MCP_TESTER_LIVE` | `0` | Set to `1` to run cases marked `live: true`. |

### Running from source

To exercise the server from TypeScript sources instead of the build
output, point the launch command at `tsx`:

```bash
MCP_TESTER_SERVER_COMMAND=node \
MCP_TESTER_SERVER_ARGS='["--import","tsx","src/index.ts"]' \
pnpm start
```

## Debugging

You can debug the vision-mcp server while the tester drives it by letting
VSCode auto-attach to the spawned server process. The tester forwards its
entire environment to the server (`serverEnv()` in `src/config.ts`), so the
`NODE_OPTIONS`/`VSCODE_INSPECTOR_OPTIONS` variables VSCode injects for
`autoAttachChildProcesses` are inherited by the server child automatically.
No tester code change is required.

Create a local `.vscode/launch.json` at the repository root (not in this
directory):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "mcp-tester: debug server",
      "runtimeArgs": ["--import", "tsx", "${workspaceFolder}/fixtures/mcp-tester/src/index.ts"],
      "cwd": "${workspaceFolder}/fixtures/mcp-tester",
      "env": {
        "MCP_TESTER_SERVER_ARGS": "[\"--import\",\"tsx\",\"src/index.ts\"]",
        "MCP_TESTER_LIVE": "1"
      },
      "console": "integratedTerminal",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

This launches the tester with `tsx` and overrides `MCP_TESTER_SERVER_ARGS`
so the server also runs from TypeScript source via `tsx`. The server's
working directory is the repository root, so `src/index.ts` and
`node_modules` resolve correctly. The repository's `tsconfig.json` does
not emit source maps, so running via `tsx` is what gives you source-level
breakpoints in `src/`.

`MCP_TESTER_LIVE=1` enables live cases — the ones that make real
provider calls. This is what makes the config useful for debugging:
every tool has a live case that exercises its real handler end to end by
sending a sample image and asserting the response mentions a subject
keyword; the non-live cases cover only input validation, so they run
without an API key. Live mode requires valid `VISION_MCP_API_KEY`,
`VISION_MCP_BASE_URL`, and `VISION_MCP_MODEL` in `.env`, and each run
makes a real (billable) provider call per tool. Remove the
`MCP_TESTER_LIVE` line to debug the non-live paths instead.

Set a breakpoint in `src/` (for example a tool handler in `src/server/`),
then press F5. VSCode attaches to both the tester and the spawned server;
execution pauses when the server reaches the breakpoint while handling a
`tools/call` request.

Things to know:

- The tester's `initialize` handshake times out after 15 seconds (see
  `CONNECT_TIMEOUT_MS` in `src/client.ts`). Auto-attach does not pause
  the server at startup, so the handshake completes normally; this only
  matters if you set a breakpoint *before* the server handles requests,
  for example in config loading. Breakpoints inside tool handlers are
  unaffected.
- `.vscode/` is gitignored at the repository root, so `launch.json` stays
  local to your machine and is not shared through git.
- The directory's `.env` remains the single source of truth for provider
  credentials; the config forwards `VISION_MCP_*` to the server through
  the tester's normal env forwarding, so no extra wiring is needed.

## Fixtures

Each tool is paired with one `cases/<tool>.case.ts` file that
default-exports a `ToolFixture`. Every fixture follows the same shape: a
pair of non-live cases that exercise input validation (they never reach
the provider, so they run without an API key) and a `live: true` case
that sends a sample image to the real provider and asserts the response
mentions a subject keyword:

```ts
import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

export default {
  tool: 'ui_to_artifact',
  cases: [
    {
      name: 'rejects a non-image image source',
      arguments: {
        image_source: 'not a source',
        output_type: 'code',
        prompt: 'convert this UI form to a React component',
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'describes the login form (live)',
      live: true,
      arguments: {
        image_source: pngDataUrl('ui-form.png'),
        output_type: 'description',
        prompt: 'Describe this interface; include the word FORM.',
      },
      assert({ result }) {
        expectKeyword(result, ['form', 'input', 'button', 'login', 'field']);
      },
    },
  ],
} satisfies ToolFixture;
```

### Images

Each tool is paired with a PNG in `assets/` whose subject is relevant to
that tool's purpose, so the live cases send a realistic call and the
keyword assertions can verify the model actually recognized the subject:

- `smiley.png` — `analyze_image` (general analysis).
- `bar-chart.png` — `analyze_data_visualization`.
- `error-dialog.png` — `diagnose_error_screenshot`.
- `text-screenshot.png` — `extract_text_from_screenshot` (renders
  "HELLO WORLD").
- `ui-form.png` — `ui_to_artifact`.
- `ui-diff-a.png` / `ui-diff-b.png` — `ui_diff_check` (identical UIs
  except the button color, blue vs red).
- `flowchart.png` — `understand_technical_diagram`.

The `pngDataUrl(filename)` helper loads any PNG from `assets/` and
returns a base64 `data:` URL; swap an image by replacing that one file —
no base64 string editing required.

### Keyword assertions

Live cases (those that make a real provider call) must verify the model
actually recognized the image content rather than just returning
non-empty text. Use `expectKeyword(result, keywords)` from
`src/fixtures.ts`: it asserts the response mentions at least one of the
given keywords (case-insensitive). Craft the prompt so a correct
analysis naturally produces one of the keywords. For example, the
`analyze_image` live case sends the smiley and asserts the response
mentions `smile`, `face`, `happy`, or `smiley`.

### `ToolCase` shape

- `name` — short, unique label printed in the summary.
- `description` — optional longer explanation.
- `arguments` — passed verbatim to `tools/call`.
- `live` — when `true`, the case is skipped unless `MCP_TESTER_LIVE=1`.
  Use this flag for any case that makes a real provider call.
- `assert(ctx)` — receives `{ toolName, arguments, result }`. Throw to fail;
  return normally to pass. Use the helpers in `src/fixtures.ts`
  (`expectNotImplemented`, `expectError`, `expectHandlerError`,
  `expectKeyword`) so no extra assertion library is needed. Live cases
  must use `expectKeyword` to confirm the model recognized the content.

### Adding a new fixture

1. Create `cases/<tool_name>.case.ts` (the suffix `.case.ts` is required).
2. Default-export a `ToolFixture` whose `tool` matches the tool's
   advertised name.
3. Run `pnpm start` — the runner discovers and imports it automatically.

A second file targeting the same tool name is rejected with a
"duplicate fixture" error.

## Project layout

```text
fixtures/mcp-tester/
├── .env.example          # Sample environment file
├── package.json          # Self-contained pnpm project
├── tsconfig.json         # TypeScript config (noEmit, includes cases)
├── README.md             # This file
├── cases/                # One .case.ts file per tool
│   └── *.case.ts
├── assets/               # PNGs consumed by pngDataUrl() in src/fixtures.ts
│   ├── smiley.png         # analyze_image
│   ├── bar-chart.png      # analyze_data_visualization
│   ├── error-dialog.png   # diagnose_error_screenshot
│   ├── text-screenshot.png # extract_text_from_screenshot
│   ├── ui-form.png        # ui_to_artifact
│   ├── ui-diff-a.png      # ui_diff_check (expected)
│   ├── ui-diff-b.png      # ui_diff_check (actual)
│   └── flowchart.png      # understand_technical_diagram
└── src/
    ├── index.ts          # Entry point: load config, spawn, run, report
    ├── config.ts         # .env loader and MCP_TESTER_* resolution
    ├── client.ts         # Spawns server, wires MCP Client over stdio
    ├── runner.ts         # Discovers tools, loads/runs fixtures
    ├── report.ts         # Summary printer and exit-code logic
    ├── fixtures.ts       # pngDataUrl loader, assertion helpers
    └── types.ts          # ToolCase / ToolFixture / CaseResult types
```

## Exit codes

- `0` — every non-skipped case passed.
- `1` — at least one case failed, or the tester could not start the server.

Server stderr is captured and appended to the error message when the
client fails to initialize, which makes provider-configuration failures
(e.g. a missing `VISION_MCP_API_KEY`) easy to diagnose.

## Development

```bash
pnpm typecheck   # tsc --noEmit over src/ and cases/
```

The tester is intentionally not part of the parent repo's pnpm workspace;
install and run it from `fixtures/mcp-tester/`.
