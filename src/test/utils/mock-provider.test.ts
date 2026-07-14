import { describe, it, expect, afterEach } from 'vitest';
import { startMockProvider, type MockProvider } from './mock-provider.js';

let mock: MockProvider | undefined;
afterEach(async () => {
  if (mock) {
    await mock.close();
    mock = undefined;
  }
});

describe('startMockProvider sequences', () => {
  it('returns responses in sequence, then repeats the last', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'busy' } },
      { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
    ]);
    const a = await fetch(mock.url);
    expect(a.status).toBe(503);
    const b = await fetch(mock.url);
    expect(b.status).toBe(200);
    const c = await fetch(mock.url);
    expect(c.status).toBe(200); // last repeats
    expect(mock.requests).toHaveLength(3);
  });

  it('honors delayMs before responding', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      {
        status: 200,
        body: { choices: [{ message: { content: 'ok' } }] },
        delayMs: 50,
      },
    ]);
    const start = Date.now();
    await fetch(mock.url);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('captures hung requests when hangMs is set', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 503, hangMs: 5_000 }]);
    // Start a fetch that will hang; use an AbortController so the test
    // does not wait 5 s.
    const controller = new AbortController();
    const fetchPromise = fetch(mock.url, { signal: controller.signal });
    // Give the server a moment to receive the request and start hanging.
    await new Promise((r) => setTimeout(r, 50));
    expect(mock.requests).toHaveLength(1);
    controller.abort();
    await fetchPromise.catch(() => {});
  });

  it('counts a client abort when a hanging response is abandoned', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 503, hangMs: 5_000 }]);
    const controller = new AbortController();
    const fetchPromise = fetch(mock.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    await fetchPromise.catch(() => {});
    // Give the server a moment to observe the socket close.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(mock.aborts).toBe(1);
    expect(mock.requests).toHaveLength(1);
  });
});
