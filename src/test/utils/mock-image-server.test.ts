import { describe, it, expect, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { startMockImageServer, type MockImageServer } from './mock-image-server.js';
import { TINY_PNG_BYTES } from './image-fixtures.js';

let server: MockImageServer | undefined;
afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe('startMockImageServer sequences', () => {
  it('returns route responses in sequence, then repeats the last', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [
      { status: 503, body: 'busy' },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES) },
    ]);
    const a = await fetch(`${server.url}/png`);
    expect(a.status).toBe(503);
    const b = await fetch(`${server.url}/png`);
    expect(b.status).toBe(200);
    const c = await fetch(`${server.url}/png`);
    expect(c.status).toBe(200); // last repeats
    expect(server.requests).toHaveLength(3);
  });

  it('honors delayMs before responding', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), delayMs: 50 },
    ]);
    const start = Date.now();
    await fetch(`${server.url}/png`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('captures hung requests when hangMs is set', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [{ status: 503, hangMs: 5_000 }]);
    const controller = new AbortController();
    const fetchPromise = fetch(`${server.url}/png`, {
      signal: controller.signal,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toHaveLength(1);
    controller.abort();
    await fetchPromise.catch(() => {});
  });

  it('counts a client abort when a hanging response is abandoned', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [{ status: 503, hangMs: 5_000 }]);
    const controller = new AbortController();
    const fetchPromise = fetch(`${server.url}/png`, {
      signal: controller.signal,
    });
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    await fetchPromise.catch(() => {});
    // Give the server a moment to observe the socket close.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(server.aborts).toBe(1);
    expect(server.requests).toHaveLength(1);
  });

  it('partialBodyMs sends a 2xx with half the body then destroys the socket', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 50 },
    ]);
    const res = await fetch(`${server.url}/png`);
    expect(res.status).toBe(200);
    // The body stream rejects mid-read because the server destroyed the
    // socket after writing only the first half of the body.
    await expect(res.arrayBuffer()).rejects.toThrow();
    expect(server.requests).toHaveLength(1);
  });
});
