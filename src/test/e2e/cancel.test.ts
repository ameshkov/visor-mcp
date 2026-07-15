import { describe, it, expect, afterEach } from 'vitest';
import {
  baseEnv,
  cancel,
  init,
  kill,
  lineReader,
  send,
  spawnServer,
  startMockProvider,
  TINY_PNG_DATA_URL,
  type MockProvider,
} from '../utils/index.js';
import type { ChildProcess } from 'node:child_process';

let mock: MockProvider | undefined;
let child: ChildProcess | undefined;

afterEach(async () => {
  if (child) {
    await kill(child);
    child = undefined;
  }
  if (mock) {
    await mock.close();
    mock = undefined;
  }
});

function envWithProvider(baseUrl: string): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    VISOR_MCP_API_KEY: 'test-key',
    VISOR_MCP_BASE_URL: baseUrl,
    VISOR_MCP_MODEL: 'test-model',
  };
}

describe('analyze_image cancellation (AC1)', () => {
  it('aborts the in-flight provider request and does not retry', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 503, hangMs: 30_000 }]);
    child = spawnServer(envWithProvider(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    // Fire tools/call (id 1001) without awaiting the response.
    send(child, {
      jsonrpc: '2.0',
      id: 1001,
      method: 'tools/call',
      params: {
        name: 'analyze_image',
        arguments: { image_source: TINY_PNG_DATA_URL, prompt: 'describe' },
      },
    });
    // Give the request time to reach the mock and start hanging.
    await new Promise<void>((r) => setTimeout(r, 100));
    cancel(child, 1001);

    // Per MCP spec, a cancelled request should not produce a response.
    // The SDK suppresses the result when the signal is aborted. We verify
    // that the mock provider observed exactly one request (no retry) and
    // one client abort (the fetch was aborted mid-flight).
    await new Promise<void>((r) => setTimeout(r, 300));
    expect(mock.requests).toHaveLength(1);
    expect(mock.aborts).toBe(1);

    // The server must still be alive and serving.
    const list = await sendAndRead(child, read, 1002, 'tools/list', {});
    expect((list as { result?: { tools?: unknown } }).result?.tools).toBeDefined();
  }, 10_000);
});

describe('analyze_image cancellation isolation (AC2)', () => {
  it('cancelling one in-flight call does not stop a concurrent call', async () => {
    mock = await startMockProvider();
    // First sequence entry hangs; second responds immediately.
    mock.setResponseSequence([
      { status: 503, hangMs: 30_000 },
      {
        status: 200,
        body: { choices: [{ message: { content: 'concurrent ok' } }] },
      },
    ]);
    child = spawnServer(envWithProvider(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    // Fire two concurrent tools/call requests.
    send(child, {
      jsonrpc: '2.0',
      id: 2001,
      method: 'tools/call',
      params: {
        name: 'analyze_image',
        arguments: { image_source: TINY_PNG_DATA_URL, prompt: 'first' },
      },
    });
    send(child, {
      jsonrpc: '2.0',
      id: 2002,
      method: 'tools/call',
      params: {
        name: 'analyze_image',
        arguments: { image_source: TINY_PNG_DATA_URL, prompt: 'second' },
      },
    });
    await new Promise<void>((r) => setTimeout(r, 100));
    cancel(child, 2001);

    // Wait for the uncancelled call (2002) to complete.
    const response = await waitForResponse(read, 2002, 5_000);
    expect(response).toBeDefined();
    const result = response!.result as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('concurrent ok');

    // Two requests total: 1 hang (cancelled, no retry) + 1 success.
    expect(mock.requests).toHaveLength(2);
    expect(mock.aborts).toBe(1);
  }, 10_000);
});

/** Helper: send a request and await its single response by id. */
async function sendAndRead(
  c: ChildProcess,
  read: () => Promise<string | null>,
  id: number,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> {
  send(c, { jsonrpc: '2.0', id, method, params });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const line = await read();
    if (line === null) throw new Error('server closed before response');
    const msg = JSON.parse(line) as Record<string, unknown>;
    if (msg.id === id) return msg;
  }
  throw new Error('timed out waiting for response ' + id);
}

/** Read lines until a response with the given id appears. */
async function waitForResponse(
  read: () => Promise<string | null>,
  id: number,
  timeoutMs: number,
): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const line = await read();
    if (line === null) return undefined;
    const msg = JSON.parse(line) as Record<string, unknown>;
    if (msg.id === id) return msg;
  }
  return undefined;
}
