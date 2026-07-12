import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CaseResult, ToolCase, ToolFixture, ToolSummary } from './types.js';

/** Suffix identifying a fixture file inside the cases directory. */
const CASE_SUFFIX = '.case.ts';

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
 * ordered by tool name.
 */
export async function runAll(
  client: Client,
  fixtures: readonly ToolFixture[],
  options: { live: boolean },
): Promise<ToolSummary[]> {
  const list = await client.listTools();
  const known = new Set(list.tools.map((t) => t.name));
  const fixturesByName = indexByTool(fixtures);
  const summaries: ToolSummary[] = [];
  for (const tool of [...fixturesByName.keys()].sort()) {
    const fixture = fixturesByName.get(tool)!;
    const discovered = known.has(tool);
    const results = discovered
      ? await runCases(client, fixture, options.live)
      : skipAll(fixture, 'tool not advertised by server');
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

function skipAll(fixture: ToolFixture, reason: string): CaseResult[] {
  return fixture.cases.map((c) => ({
    tool: fixture.tool,
    case: c.name,
    status: 'skipped',
    reason,
  }));
}

async function runCases(
  client: Client,
  fixture: ToolFixture,
  live: boolean,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of fixture.cases) {
    results.push(await runCase(client, fixture.tool, c, live));
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
  try {
    // Passing CallToolResultSchema validates the response at runtime against
    // the strict shape (which requires `content`). The static return type is
    // still a union with the legacy `toolResult` variant, so narrow with a
    // runtime guard before handing the result to the case.
    const raw = await client.callTool(
      { name: toolName, arguments: c.arguments },
      CallToolResultSchema,
    );
    const result = toCallToolResult(raw, toolName);
    await c.assert({ toolName, arguments: c.arguments, result });
    return { tool: toolName, case: c.name, status: 'passed' };
  } catch (error) {
    return {
      tool: toolName,
      case: c.name,
      status: 'failed',
      reason: toMessage(error),
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
