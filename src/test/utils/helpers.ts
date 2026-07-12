// Shared test support. Knip excludes `src/test/**` from its analysis
// (see `knip.config.ts`), so test-only exports here are not flagged as
// unused.

import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// A real 1x1 transparent PNG; decoded bytes begin with the PNG signature.
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

export const baseEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VISION_MCP_')),
) as NodeJS.ProcessEnv;

export interface CapturedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
}

export interface MockProvider {
  url: string;
  requests: CapturedRequest[];
  setResponse(status: number, body: unknown): void;
  close(): Promise<void>;
}

const DEFAULT_BODY = { choices: [{ message: { content: 'mock analysis result' } }] };

export function startMockProvider(initial?: {
  status?: number;
  body?: unknown;
}): Promise<MockProvider> {
  const requests: CapturedRequest[] = [];
  let status = initial?.status ?? 200;
  let body: unknown = initial?.body ?? DEFAULT_BODY;
  const server: Server = createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      let parsed: unknown = data;
      if (data.length > 0) {
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
      }
      requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        authorization: req.headers.authorization,
        body: parsed,
      });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  return new Promise<MockProvider>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveListen({
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        setResponse(nextStatus: number, nextBody: unknown) {
          status = nextStatus;
          body = nextBody;
        },
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

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

export const TINY_PNG_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.from(TINY_PNG_BASE64, 'base64'),
);

export interface CapturedImageRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  cookie: string | undefined;
}

export interface MockImageRoute {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: Uint8Array | string;
}

export interface MockImageServer {
  url: string;
  requests: CapturedImageRequest[];
  setRoute(path: string, route: MockImageRoute): void;
  close(): Promise<void>;
}

export function startMockImageServer(): Promise<MockImageServer> {
  const routes = new Map<string, MockImageRoute>();
  const requests: CapturedImageRequest[] = [];
  const server: Server = createServer((req, res) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      const url = req.url ?? '';
      const matchPath = url.split('?')[0];
      requests.push({
        method: req.method ?? '',
        path: url,
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      });
      void data;
      const route = routes.get(matchPath);
      if (route === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(route.status, route.headers ?? {});
      if (route.body === undefined) {
        res.end();
      } else if (typeof route.body === 'string') {
        res.end(route.body);
      } else {
        res.end(Buffer.from(route.body));
      }
    });
  });
  return new Promise<MockImageServer>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveListen({
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        setRoute(path: string, route: MockImageRoute) {
          routes.set(path, route);
        },
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

export interface TempFile {
  readonly path: string;
  cleanup(): void;
}

export function createTempDir(prefix = 'vision-mcp-'): TempFile {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeTempFile(data: Uint8Array, name = 'image.png'): TempFile {
  const dir = createTempDir('vision-mcp-file-');
  const filePath = join(dir.path, name);
  writeFileSync(filePath, data);
  return { path: filePath, cleanup: () => rmSync(dir.path, { recursive: true, force: true }) };
}
