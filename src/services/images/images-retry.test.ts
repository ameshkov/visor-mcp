import { describe, it, expect, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { loadImage } from './images.js';
import {
  startMockImageServer,
  TINY_PNG_BYTES,
  TINY_PNG_BASE64,
  type MockImageServer,
} from '../../test/utils/index.js';

let server: MockImageServer | undefined;
afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe('loadImage http retry policy', () => {
  // NOTE: Retry tests use real timers because fake timers interfere with
  // Node.js HTTP I/O used by the mock server and fetch. The 1 s + 2 s
  // backoff adds ~3 s per retry test — acceptable under the 10 s timeout.

  it.each([503, 429, 408, 500])(
    'retries transient HTTP %i (image) twice then succeeds',
    async (status) => {
      server = await startMockImageServer();
      server.setRouteSequence('/png', [
        { status, body: 'busy' },
        { status, body: 'busy' },
        { status: 200, body: Buffer.from(TINY_PNG_BYTES) },
      ]);
      const image = await loadImage(`${server.url}/png`, 5, 60_000);
      expect(image.mimeType).toBe('image/png');
      expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
      expect(server.requests).toHaveLength(3);
    },
    10_000,
  );

  it('retries a connection failure three times then throws the sanitized error', async () => {
    server = await startMockImageServer();
    // HTTPS to a plain-HTTP server fails the TLS handshake → connection
    // failure → retriable. Real 1s+2s backoff ≈ 3s.
    const httpsUrl = server.url.replace('http://', 'https://');
    const err = await loadImage(`${httpsUrl}/png`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
  }, 10_000);

  it('retries a per-attempt download timeout three times then throws the sanitized error', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [
      { status: 503, hangMs: 5_000 },
      { status: 503, hangMs: 5_000 },
      { status: 503, hangMs: 5_000 },
    ]);
    // requestTimeoutMs=50, so each attempt aborts after 50ms. Mock server
    // hangs for 5s, but client aborts after 50ms + 1s + 2s ≈ 3.1s.
    const err = await loadImage(`${server.url}/png`, 5, 50).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
    expect(server.requests).toHaveLength(3);
  }, 10_000);

  it('retries a mid-stream body-read failure three times then throws the sanitized error', async () => {
    server = await startMockImageServer();
    // Each route writes a 2xx status + the first half of the PNG body, then
    // hangs for 100ms before destroying the socket. The client reads the
    // partial chunk successfully, then the next `reader.read()` rejects when
    // the socket dies mid-stream — exercising the `readBoundedBody` catch
    // (retriable `image download failed`) rather than the fetch catch or the
    // per-attempt timeout. requestTimeoutMs=60s so the timeout cannot fire
    // before the 100ms socket destroy.
    server.setRouteSequence('/png', [
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 100 },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 100 },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 100 },
    ]);
    const err = await loadImage(`${server.url}/png`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('image download failed');
    expect(server.requests).toHaveLength(3);
  }, 10_000);

  it('retries a per-attempt timeout firing mid-body three times then throws the sanitized error', async () => {
    server = await startMockImageServer();
    // Each route writes a 2xx status + the first half of the PNG body, then
    // hangs for 5s. requestTimeoutMs=50, so each attempt's composedSignal
    // aborts after 50ms while `reader.read()` is blocked waiting for the rest
    // of the body — exercising the `readBoundedBody` catch (retriable
    // `image download failed`) rather than the fetch catch or the
    // mid-stream socket-destroy path. This is the image analog of
    // provider-retry.test.ts' mid-body-timeout test.
    server.setRouteSequence('/png', [
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 5_000 },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 5_000 },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 5_000 },
    ]);
    const err = await loadImage(`${server.url}/png`, 5, 50).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('image download failed');
    expect(server.requests).toHaveLength(3);
  }, 10_000);

  it.each([
    ['404', 404],
    ['400', 400],
    ['401', 401],
    ['403', 403],
    ['410', 410],
  ])('does NOT retry a permanent HTTP %s', async (_name, status) => {
    server = await startMockImageServer();
    server.setRoute('/gone', { status });
    const err = await loadImage(`${server.url}/gone`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
    expect(server.requests).toHaveLength(1);
  });

  it('does NOT retry a redirect-limit-exceeded error', async () => {
    server = await startMockImageServer();
    for (let i = 0; i <= 5; i++) {
      server.setRoute(`/r${i}`, {
        status: 302,
        headers: { location: `/r${i + 1}` },
      });
    }
    server.setRoute('/r6', {
      status: 200,
      body: Buffer.from(TINY_PNG_BYTES),
    });
    const err = await loadImage(`${server.url}/r0`, 5, 60_000).catch((e) => e);
    expect((err as Error).message).toMatch(/redirect limit/);
    // The redirect loop is bounded by MAX_REDIRECTS; no retry happens.
  });

  it('does NOT retry a validation failure (oversize)', async () => {
    server = await startMockImageServer();
    server.setRoute('/big', { status: 200, body: Buffer.alloc(10, 0x89) });
    const err = await loadImage(`${server.url}/big`, 1e-6, 60_000).catch((e) => e);
    expect((err as Error).message).toMatch(/size limit/);
    expect(server.requests).toHaveLength(1);
  });

  it('does NOT retry a validation failure (unsupported format)', async () => {
    server = await startMockImageServer();
    server.setRoute('/html', { status: 200, body: '<html></html>' });
    const err = await loadImage(`${server.url}/html`, 5, 60_000).catch((e) => e);
    expect((err as Error).message).toMatch(/supported format/);
    expect(server.requests).toHaveLength(1);
  });

  it('does NOT retry a validation failure (declared MIME mismatch)', async () => {
    server = await startMockImageServer();
    server.setRoute('/png', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.from(TINY_PNG_BYTES),
    });
    const err = await loadImage(`${server.url}/png`, 5, 60_000).catch((e) => e);
    expect((err as Error).message).toMatch(/declared format/);
    expect(server.requests).toHaveLength(1);
  });
});

describe('loadImage http cancellation', () => {
  it('aborts an in-flight HTTP download when the external signal fires', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [{ status: 503, hangMs: 5_000 }]);
    const controller = new AbortController();
    const promise = loadImage(`${server.url}/png`, 5, 60_000, controller.signal);
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Request cancelled');
    expect(server.requests).toHaveLength(1);
  }, 5_000);

  it('does not dispatch a second attempt when the signal aborts during the backoff', async () => {
    server = await startMockImageServer();
    server.setRouteSequence('/png', [
      { status: 503, body: 'busy' },
      { status: 200, body: Buffer.from(TINY_PNG_BYTES) },
    ]);
    const controller = new AbortController();
    const promise = loadImage(`${server.url}/png`, 5, 60_000, controller.signal);
    await new Promise<void>((r) => setTimeout(r, 100));
    controller.abort();
    const err = await promise.catch((e) => e);
    expect((err as Error).message).toBe('Request cancelled');
    expect(server.requests).toHaveLength(1);
  }, 5_000);

  it('classifies a mid-body caller abort as Request cancelled, not a download failure', async () => {
    server = await startMockImageServer();
    // The server sends a 200 with headers + the first half of the PNG body,
    // then hangs. The client reads the partial chunk, then `reader.read()`
    // blocks waiting for the rest. Aborting the external signal during that
    // window aborts the body stream; `readBoundedBody` catch returns a
    // retriable `image download failed`, but `withRetry`'s post-attempt
    // `signal?.aborted` check short-circuits to the permanent
    // `Request cancelled` so the user sees the cancellation, not a misleading
    // retry-exhausted download failure. This is the image analog of
    // provider-retry.test.ts' mid-body-abort test.
    server.setRouteSequence('/png', [
      { status: 200, body: Buffer.from(TINY_PNG_BYTES), partialBodyMs: 5_000 },
    ]);
    const controller = new AbortController();
    const promise = loadImage(`${server.url}/png`, 5, 60_000, controller.signal);
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Request cancelled');
    expect(server.requests).toHaveLength(1);
    expect(server.aborts).toBe(1);
  }, 5_000);
});
