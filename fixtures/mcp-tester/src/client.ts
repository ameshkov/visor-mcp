import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Readable } from 'node:stream';
import { serverEnv, type TesterConfig } from './config.js';

/** Maximum time to wait for the server's `initialize` handshake, in ms. */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Spawn the MCP server under test, connect a single MCP {@link Client} over
 * stdio, and invoke `fn` with the connected client. Always closes the client
 * and transport before returning.
 *
 * Captures server stderr so connection failures can be diagnosed: when the
 * server fails to start (for example because of invalid configuration) the
 * captured stderr is appended to the thrown error.
 */
export async function withClient<T>(
  config: TesterConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: config.serverCommand,
    args: [...config.serverArgs],
    cwd: config.serverCwd,
    env: serverEnv(),
    stderr: 'pipe',
  });

  // `transport.stderr` is typed as `Stream | null`; with `stderr: 'pipe'` it
  // is a PassThrough Readable. Cast to the narrower type for `on('data', ...)`.
  const stderr = captureStderr(transport.stderr as Readable | null);
  const client = new Client({ name: 'mcp-tester', version: '0.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
    return await fn(client);
  } catch (error) {
    throw enrichError(error, stderr());
  } finally {
    try {
      await client.close();
    } catch {
      // ignore — best-effort cleanup after a failure
    }
  }
}

/**
 * Attach a UTF-8 data listener to a stream and return a function that drains
 * the captured text. Safe to call with `null` (returns a no-op drain).
 */
function captureStderr(stream: Readable | null): () => string {
  if (stream === null) return () => '';
  const chunks: string[] = [];
  stream.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
  });
  return () => chunks.join('');
}

/**
 * Wrap a connection error with the server's stderr output when the server
 * printed anything diagnostics-worthy before failing.
 */
function enrichError(error: unknown, stderr: string): unknown {
  const captured = stderr.trim();
  if (captured.length === 0) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\n--- server stderr ---\n${captured}`);
}
