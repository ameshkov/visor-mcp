import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CaseResult, ProgressEvent, ToolCase, ToolFixture, ToolSummary } from './types.js';

/** Suffix identifying a fixture file inside the cases directory. */
const CASE_SUFFIX = '.case.ts';

/**
 * Per-call timeout for `tools/call`, in ms. Generous on purpose: the server
 * retries transient provider failures up to twice (with 1s and 2s backoff)
 * and each attempt is bounded by its own `VISION_MCP_REQUEST_TIMEOUT_MS`,
 * so a fully retried call can take well over the MCP SDK's 60s default. This
 * lets the server's retry policy complete before the client raises
 * `RequestTimeout`.
 */
const CALL_TOOL_TIMEOUT_MS = 180_000;

/**
 * Discover every `*.case.ts` file in `dir` and import its default export as
 * a {@link ToolFixture}. Files are processed in lexical order for stable
 * output. Throws a friendly error when `dir` does not exist or when a file
 * is missing its default export or the export is not a valid fixture.
 */
export async function loadFixtures(dir: string): Promise<ToolFixture[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (isENOENT(error)) {
      throw new Error(`fixture directory does not exist: ${dir}`);
    }
    throw error;
  }
  const files = entries.filter((name) => name.endsWith(CASE_SUFFIX)).sort();
  const fixtures: ToolFixture[] = [];
  for (const name of files) {
    const url = pathToFileURL(join(dir, name)).href;
    const mod = (await import(url)) as { default?: unknown };
    assertFixture(mod.default, name);
    fixtures.push(mod.default as ToolFixture);
  }
  return fixtures;
}

function isENOENT(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function assertFixture(value: unknown, file: string): void {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${file}: default export must be a ToolFixture object`);
  }
  const f = value as { tool?: unknown; cases?: unknown };
  if (typeof f.tool !== 'string' || f.tool.length === 0) {
    throw new Error(`${file}: fixture.tool must be a non-empty string`);
  }
  if (!Array.isArray(f.cases)) {
    throw new Error(`${file}: fixture.cases must be an array`);
  }
}

/**
 * Discover the server's tools via the MCP client, then run each fixture
 * against its matching tool. Returns one {@link ToolSummary} per fixture,
 * ordered by tool name. When `onProgress` is supplied it is invoked as each
 * tool begins and as each case finishes, so callers can print live progress
 * instead of waiting for the full run to complete.
 */
export async function runAll(
  client: Client,
  fixtures: readonly ToolFixture[],
  options: { live: boolean; onProgress?: (event: ProgressEvent) => void },
): Promise<ToolSummary[]> {
  const list = await client.listTools();
  const known = new Set(list.tools.map((t) => t.name));
  const fixturesByName = indexByTool(fixtures);
  const summaries: ToolSummary[] = [];
  for (const tool of [...fixturesByName.keys()].sort()) {
    const fixture = fixturesByName.get(tool)!;
    const discovered = known.has(tool);
    options.onProgress?.({
      type: 'tool',
      tool,
      discovered,
      caseCount: fixture.cases.length,
    });
    const results = discovered
      ? await runCases(client, fixture, options.live, options.onProgress)
      : skipAll(fixture, 'tool not advertised by server', options.onProgress);
    summaries.push({ tool, discovered, results });
  }
  return summaries;
}

function indexByTool(fixtures: readonly ToolFixture[]): Map<string, ToolFixture> {
  const map = new Map<string, ToolFixture>();
  for (const fixture of fixtures) {
    if (map.has(fixture.tool)) {
      throw new Error(`duplicate fixture for tool "${fixture.tool}"`);
    }
    map.set(fixture.tool, fixture);
  }
  return map;
}

function skipAll(
  fixture: ToolFixture,
  reason: string,
  onProgress?: (event: ProgressEvent) => void,
): CaseResult[] {
  return fixture.cases.map((c) => {
    const result: CaseResult = {
      tool: fixture.tool,
      case: c.name,
      status: 'skipped',
      reason,
    };
    onProgress?.({ type: 'case', result });
    return result;
  });
}

async function runCases(
  client: Client,
  fixture: ToolFixture,
  live: boolean,
  onProgress?: (event: ProgressEvent) => void,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of fixture.cases) {
    const result = await runCase(client, fixture.tool, c, live);
    onProgress?.({ type: 'case', result });
    results.push(result);
  }
  return results;
}

async function runCase(
  client: Client,
  toolName: string,
  c: ToolCase,
  live: boolean,
): Promise<CaseResult> {
  if (c.live && !live) {
    return { tool: toolName, case: c.name, status: 'skipped', reason: 'live mode off' };
  }
  const startedAt = Date.now();
  try {
    // Passing CallToolResultSchema validates the response at runtime against
    // the strict shape (which requires `content`). The static return type is
    // still a union with the legacy `toolResult` variant, so narrow with a
    // runtime guard before handing the result to the case. The generous
    // timeout lets the server's retry policy complete for live cases.
    const raw = await client.callTool(
      { name: toolName, arguments: c.arguments },
      CallToolResultSchema,
      { timeout: CALL_TOOL_TIMEOUT_MS },
    );
    const result = toCallToolResult(raw, toolName);
    await c.assert({ toolName, arguments: c.arguments, result });
    return {
      tool: toolName,
      case: c.name,
      status: 'passed',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      tool: toolName,
      case: c.name,
      status: 'failed',
      reason: toMessage(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

function toCallToolResult(raw: unknown, toolName: string): CallToolResult {
  if (typeof raw !== 'object' || raw === null || !('content' in raw)) {
    throw new Error(`${toolName}: result is missing required "content" field`);
  }
  return raw as CallToolResult;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
