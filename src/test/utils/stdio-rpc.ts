// Shared test support — stdio RPC helpers. Knip excludes `src/test/**` from
// its analysis.

import { spawn, type ChildProcess } from 'node:child_process';
import { PROJECT_ROOT } from './image-fixtures.js';

export type ReadLine = () => Promise<string | null>;

export function spawnServer(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function lineReader(stream: NodeJS.ReadableStream): ReadLine {
  let buf = '';
  const waiters: Array<(v: string | null) => void> = [];
  const pending: string[] = [];
  stream.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i: number;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      const w = waiters.shift();
      if (w) w(line);
      else pending.push(line);
    }
  });
  stream.on('end', () => {
    const w = waiters.shift();
    if (w) w(null);
  });
  return () =>
    pending.length ? Promise.resolve(pending.shift()!) : new Promise((r) => waiters.push(r));
}

let seq = 0;

export function send(child: ChildProcess, obj: unknown): void {
  child.stdin!.write(JSON.stringify(obj) + '\n');
}

export async function request(
  child: ChildProcess,
  read: ReadLine,
  method: string,
  params?: unknown,
): Promise<Record<string, unknown>> {
  const id = ++seq;
  send(child, { jsonrpc: '2.0', id, method, params });
  for (;;) {
    const line = await read();
    if (line === null) throw new Error('server stdout closed before response');
    const msg = JSON.parse(line) as Record<string, unknown>;
    if (msg.id === id) return msg;
  }
}

export async function init(child: ChildProcess, read: ReadLine): Promise<void> {
  await request(child, read, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' },
  });
  send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
}

export function kill(child: ChildProcess): Promise<void> {
  child.kill();
  return new Promise((r) => child.on('exit', () => r()));
}

/**
 * Send a JSON-RPC notification (no id, no response expected) to the spawned
 * server. Used to deliver `notifications/cancelled` and
 * `notifications/initialized` mid-session.
 */
export function sendNotification(child: ChildProcess, method: string, params?: unknown): void {
  const msg: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (params !== undefined) {
    msg.params = params;
  }
  send(child, msg);
}

/**
 * Cancel an in-flight request by sending `notifications/cancelled` with the
 * given request id. Per the MCP spec, the params shape is
 * `{ requestId: string | number, reason?: string }`.
 */
export function cancel(child: ChildProcess, requestId: number | string): void {
  sendNotification(child, 'notifications/cancelled', {
    requestId,
    reason: 'test cancellation',
  });
}
