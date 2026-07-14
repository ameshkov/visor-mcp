import { describe, it, expect, afterEach } from 'vitest';
import { analyze } from './provider.js';
import { startMockProvider, TINY_PNG_DATA_URL, type MockProvider } from '../../test/utils/index.js';

const REQUEST = {
  systemPrompt: 'sys',
  userText: 'describe this image',
  images: [
    {
      mimeType: 'image/png',
      bytes: new Uint8Array(),
      dataUrl: TINY_PNG_DATA_URL,
    },
  ],
};

function config(baseUrl: string, requestTimeoutMs = 60_000) {
  return {
    apiKey: 'test-key',
    baseUrl,
    model: 'test-model',
    maxImageSizeMb: 5,
    requestTimeoutMs,
    requestBodyExtras: {},
    chatCompletionsEndpoint: `${baseUrl}/chat/completions`,
  };
}

let mock: MockProvider | undefined;
afterEach(async () => {
  if (mock) {
    await mock.close();
    mock = undefined;
  }
});

describe('analyze retry policy', () => {
  // NOTE: The retry tests below use real timers because fake timers
  // interfere with Node.js HTTP I/O used by the mock server and fetch.
  // The 1 s + 2 s backoff delays add ~3 s per retry test — acceptable
  // under the 15 s per-test timeout.

  it.each([503, 429, 408, 500])(
    'retries a transient HTTP %i twice then succeeds',
    async (status) => {
      mock = await startMockProvider();
      mock.setResponseSequence([
        { status, body: { error: 'busy' } },
        { status, body: { error: 'busy' } },
        {
          status: 200,
          body: { choices: [{ message: { content: 'ok' } }] },
        },
      ]);
      const result = await analyze(config(mock.url), REQUEST);
      expect(result).toEqual({ ok: true, text: 'ok' });
      expect(mock.requests).toHaveLength(3);
    },
    10_000,
  );

  it('retries a connection failure three times then returns a sanitized error', async () => {
    // ECONNREFUSED on every attempt. The initial attempt + 1s + 2s backoff
    // = ~3 s real time.
    const result = await analyze(config('http://127.0.0.1:1'), REQUEST);
    expect(result).toEqual({ ok: false, error: 'provider request failed' });
  }, 10_000);

  it('retries a per-attempt timeout three times then returns a sanitized error', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, hangMs: 5_000 },
      { status: 503, hangMs: 5_000 },
      { status: 503, hangMs: 5_000 },
    ]);
    // With requestTimeoutMs=50, each attempt aborts after 50ms via
    // withAttemptTimeout's AbortController. The mock server hangs for
    // 5s on each request, but the client aborts after 50ms.
    const result = await analyze(config(mock.url, 50), REQUEST);
    expect(result).toEqual({ ok: false, error: 'provider request failed' });
  }, 10_000);

  it('retries a per-attempt timeout firing mid-body three times then returns a sanitized error', async () => {
    // The "hung provider after headers" case: the provider returns 2xx
    // with headers and the first half of the JSON body, then stalls. The
    // per-attempt timeout aborts the body stream while response.json()
    // is blocked waiting for the rest. The body-read catch must classify
    // this as a retriable timeout (not a permanent `malformed provider
    // response`), so the retry loop runs all three attempts — the
    // mirror of the `hangMs` test above, but exercising the body-read
    // catch instead of the fetch catch.
    mock = await startMockProvider();
    mock.setResponseSequence([
      {
        status: 200,
        body: { choices: [{ message: { content: 'ok' } }] },
        partialBodyMs: 5_000,
      },
      {
        status: 200,
        body: { choices: [{ message: { content: 'ok' } }] },
        partialBodyMs: 5_000,
      },
      {
        status: 200,
        body: { choices: [{ message: { content: 'ok' } }] },
        partialBodyMs: 5_000,
      },
    ]);
    // With requestTimeoutMs=50, each attempt aborts after 50ms via
    // withAttemptTimeout's AbortController while response.json() is
    // waiting on the body that the mock keeps hanging for 5s.
    const result = await analyze(config(mock.url, 50), REQUEST);
    expect(result).toEqual({ ok: false, error: 'provider request failed' });
    expect(mock.requests).toHaveLength(3);
  }, 10_000);

  it('does NOT retry a permanent 4xx (400)', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 400, body: { error: 'bad request' } }]);
    const result = await analyze(config(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'provider request failed' });
    expect(mock.requests).toHaveLength(1);
  });

  it('does NOT retry a malformed-response body', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      {
        status: 200,
        body: {
          choices: [{ message: { content: null, refusal: 'no' } }],
        },
      },
    ]);
    const result = await analyze(config(mock.url), REQUEST);
    expect(result).toEqual({
      ok: false,
      error: 'malformed provider response',
    });
    expect(mock.requests).toHaveLength(1);
  });

  it('does NOT retry a 2xx non-JSON body', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 200, body: '<html>not json</html>' }]);
    const result = await analyze(config(mock.url), REQUEST);
    expect(result).toEqual({
      ok: false,
      error: 'malformed provider response',
    });
    expect(mock.requests).toHaveLength(1);
  });

  it('returns one sanitized exhausted-retry result', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'leak: api_key=sk-1234' } },
      { status: 503, body: { error: 'leak: api_key=sk-1234' } },
      { status: 503, body: { error: 'leak: api_key=sk-1234' } },
    ]);
    const result = await analyze(config(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'provider request failed' });
    expect(result.ok ? '' : result.error).not.toMatch(/sk-|api_key|leak/i);
    expect(mock.requests).toHaveLength(3);
  }, 10_000);
});

describe('analyze cancellation', () => {
  it('aborts an in-flight provider request when the external signal fires', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([{ status: 503, hangMs: 5_000 }]);
    const controller = new AbortController();
    const promise = analyze(config(mock.url, 60_000), REQUEST, controller.signal);
    // Let the request reach the mock.
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ ok: false, error: 'Request cancelled' });
    expect(mock.requests).toHaveLength(1);
  }, 5_000);

  it('does not dispatch a second attempt when the signal aborts during the backoff', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'busy' } },
      { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
    ]);
    const controller = new AbortController();
    const promise = analyze(config(mock.url, 60_000), REQUEST, controller.signal);
    // Wait long enough for the first 503 attempt to complete (near-instant)
    // and the 1s backoff to begin. Real time: 100ms is well within the 1s backoff.
    await new Promise<void>((r) => setTimeout(r, 100));
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ ok: false, error: 'Request cancelled' });
    expect(mock.requests).toHaveLength(1);
  }, 5_000);

  it('classifies a mid-body abort as Request cancelled, not a malformed response', async () => {
    // The mock sends a 200 with headers + the first half of the JSON body,
    // then hangs. The client receives headers and a partial body, so
    // response.json() blocks waiting for the rest. Aborting the external
    // signal during that window aborts the body stream and response.json()
    // throws inside attemptProviderRequest. The catch must classify the
    // caller abort as `Request cancelled` rather than the misleading
    // `malformed provider response`.
    mock = await startMockProvider();
    mock.setResponseSequence([
      {
        status: 200,
        body: { choices: [{ message: { content: 'ok' } }] },
        partialBodyMs: 5_000,
      },
    ]);
    const controller = new AbortController();
    const promise = analyze(config(mock.url, 60_000), REQUEST, controller.signal);
    // Let the request reach the mock and the headers + partial body arrive.
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ ok: false, error: 'Request cancelled' });
    expect(mock.requests).toHaveLength(1);
    expect(mock.aborts).toBe(1);
  }, 5_000);
});
