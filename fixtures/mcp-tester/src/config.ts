import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Root of the tester package (`fixtures/mcp-tester/`). */
export const TESTER_ROOT = resolve(HERE, '..');

/** Root of the vision-mcp repository that this tester exercises. */
export const REPO_ROOT = resolve(HERE, '..', '..', '..');

/** Resolved test configuration loaded from `.env` and `process.env`. */
export interface TesterConfig {
  /** Executable used to launch the MCP server under test. */
  readonly serverCommand: string;
  /** Arguments passed to {@link TesterConfig.serverCommand}. */
  readonly serverArgs: readonly string[];
  /** Working directory for the spawned server. */
  readonly serverCwd: string;
  /** Absolute path to the directory holding `.case.ts` fixture files. */
  readonly fixturesDir: string;
  /** Whether live (real-provider) cases should run. */
  readonly live: boolean;
}

/**
 * Load tester configuration. Reads `.env` from the current working directory
 * (without overriding existing `process.env` values), then resolves every
 * `MCP_TESTER_*` variable with documented defaults.
 */
export function loadTesterConfig(): TesterConfig {
  dotenv.config({ path: join(process.cwd(), '.env'), override: false, quiet: true });

  const serverCommand = valueOr('MCP_TESTER_SERVER_COMMAND', 'node');
  const serverArgs = parseArgs(process.env.MCP_TESTER_SERVER_ARGS ?? 'build/index.js');
  const serverCwd = resolve(process.env.MCP_TESTER_SERVER_CWD ?? REPO_ROOT);
  const fixturesDir = resolve(process.env.MCP_TESTER_FIXTURES_DIR ?? join(TESTER_ROOT, 'cases'));
  const live = process.env.MCP_TESTER_LIVE === '1';

  return { serverCommand, serverArgs, serverCwd, fixturesDir, live };
}

/**
 * Build the environment passed to the spawned server. The server's own
 * `loadConfig` step reads `VISION_MCP_*` variables, so we forward the whole
 * resolved environment (env file values merged onto `process.env`) to make
 * the tester's `.env` the single source of truth.
 */
export function serverEnv(): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) forwarded[key] = value;
  }
  return forwarded;
}

function valueOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? fallback : value;
}

/**
 * Parse a server-args value. Accepts a JSON string array (for arguments that
 * contain spaces) or a whitespace-separated string.
 */
function parseArgs(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
        return parsed;
      }
    } catch {
      // fall through to whitespace splitting
    }
  }
  return trimmed.split(/\s+/).filter((part) => part.length > 0);
}
