import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, type ServerConfig } from '../../config/index.js';
import { analyze } from './provider.js';
import { startMockProvider, type MockProvider, TINY_PNG_DATA_URL } from '../../test/utils/index.js';

let mock: MockProvider | undefined;
afterEach(async () => {
  if (mock) {
    await mock.close();
    mock = undefined;
  }
});

function configFor(baseUrl: string) {
  return loadConfig({
    env: {
      VISION_MCP_API_KEY: 'test-key',
      VISION_MCP_BASE_URL: baseUrl,
      VISION_MCP_MODEL: 'test-model',
    },
    cwd: process.cwd(),
  });
}

const REQUEST = {
  systemPrompt: 'system-prompt-text',
  userText: 'describe this image',
  images: [{ mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]), dataUrl: TINY_PNG_DATA_URL }],
};

describe('analyze request composition', () => {
  it('posts to /chat/completions with bearer auth, model, stream:false, and ordered messages', async () => {
    mock = await startMockProvider();
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: true, text: 'mock analysis result' });
    expect(mock.requests).toHaveLength(1);
    const captured = mock.requests[0];
    expect(captured.method).toBe('POST');
    expect(captured.path).toBe('/chat/completions');
    expect(captured.authorization).toBe('Bearer test-key');
    const body = captured.body as Record<string, unknown>;
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('system-prompt-text');
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } });
    expect(content[1]).toEqual({ type: 'text', text: 'describe this image' });
  });
});

describe('analyze response normalization', () => {
  it('returns the first choice text when content is a string', async () => {
    mock = await startMockProvider({ body: { choices: [{ message: { content: 'hello' } }] } });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: true, text: 'hello' });
  });

  it('concatenates textual parts when content is an array in provider order', async () => {
    mock = await startMockProvider({
      body: {
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'part-a ' },
                { type: 'text', text: 'part-b' },
              ],
            },
          },
        ],
      },
    });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: true, text: 'part-a part-b' });
  });

  it('returns a malformed-response error when there is no usable text', async () => {
    mock = await startMockProvider({ body: { choices: [{ message: { refusal: 'no' } }] } });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('returns a sanitized malformed-response error for a 2xx non-JSON body', async () => {
    // A misconfigured proxy/gateway may return HTTP 200 with an HTML error
    // page or a truncated body. response.json() throws SyntaxError on such a
    // body; analyze must catch it and return a sanitized result rather than
    // throwing into the MCP SDK. Asserting `toEqual` (not just `ok:false`)
    // also verifies no provider body content leaks into the error string, and
    // the test itself fails (unhandled rejection) if analyze throws.
    mock = await startMockProvider({ status: 200, body: '<html>not json</html>' });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('returns an error for a non-2xx response', async () => {
    // 400 is a permanent failure — not retried.
    mock = await startMockProvider({ status: 400, body: { error: 'boom' } });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
  });
});

describe('analyze request-extras merge', () => {
  it('includes nested object extras unchanged in the request body', async () => {
    mock = await startMockProvider();
    const cfg: ServerConfig = {
      apiKey: 'test-key',
      baseUrl: mock.url,
      model: 'real-model',
      maxImageSizeMb: 5,
      requestTimeoutMs: 60_000,
      requestBodyExtras: { reasoning: { effort: 'high', max_tokens: 1000 } },
      chatCompletionsEndpoint: `${mock.url}/chat/completions`,
    };
    await analyze(cfg, REQUEST);
    const body = mock.requests[0].body as Record<string, unknown>;
    expect(body.reasoning).toEqual({ effort: 'high', max_tokens: 1000 });
    expect(body.model).toBe('real-model');
    expect(body.stream).toBe(false);
  });

  it('preserves scalar, null, and array JSON value types in extras', async () => {
    mock = await startMockProvider();
    const cfg: ServerConfig = {
      apiKey: 'test-key',
      baseUrl: mock.url,
      model: 'real-model',
      maxImageSizeMb: 5,
      requestTimeoutMs: 60_000,
      requestBodyExtras: {
        temperature: 0.7,
        parallel_tool_calls: false,
        user_marker: null,
        stop: ['\n', '\t', null, 1, true, { nested: 'x' }],
      },
      chatCompletionsEndpoint: `${mock.url}/chat/completions`,
    };
    await analyze(cfg, REQUEST);
    const body = mock.requests[0].body as Record<string, unknown>;
    expect(body.temperature).toBe(0.7);
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.user_marker).toBeNull();
    expect(body.stop).toEqual(['\n', '\t', null, 1, true, { nested: 'x' }]);
  });

  it('keeps model, messages, and stream server-controlled when extras collide', async () => {
    // Bypasses `loadConfig` (which rejects protected top-level keys) to test the
    // runtime defense-in-depth required by User Story 6 acceptance scenario 4:
    // `composeRequestBody` itself must guarantee server-owned fields win any
    // collision, regardless of what the extras object contains.
    mock = await startMockProvider();
    const cfg: ServerConfig = {
      apiKey: 'test-key',
      baseUrl: mock.url,
      model: 'real-model',
      maxImageSizeMb: 5,
      requestTimeoutMs: 60_000,
      requestBodyExtras: {
        model: 'evil-model',
        messages: ['evil'],
        stream: true,
        reasoning_effort: 'high',
      },
      chatCompletionsEndpoint: `${mock.url}/chat/completions`,
    };
    await analyze(cfg, REQUEST);
    const body = mock.requests[0].body as Record<string, unknown>;
    expect(body.model).toBe('real-model');
    expect(body.stream).toBe(false);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('system-prompt-text');
    expect(messages[1].content as Array<Record<string, unknown>>).toContainEqual({
      type: 'text',
      text: 'describe this image',
    });
    expect(body.reasoning_effort).toBe('high');
  });

  it('appends /chat/completions exactly once regardless of extras', async () => {
    mock = await startMockProvider();
    const cfg: ServerConfig = {
      apiKey: 'test-key',
      baseUrl: mock.url,
      model: 'real-model',
      maxImageSizeMb: 5,
      requestTimeoutMs: 60_000,
      requestBodyExtras: { reasoning_effort: 'high' },
      chatCompletionsEndpoint: `${mock.url}/chat/completions`,
    };
    await analyze(cfg, REQUEST);
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].path).toBe('/chat/completions');
  });
});

describe('analyze response normalization variants', () => {
  async function analyzeBody(body: unknown) {
    mock = await startMockProvider({ body });
    return analyze(configFor(mock.url), REQUEST);
  }

  it('extracts text from a mixed content array, ignoring non-text parts', async () => {
    const result = await analyzeBody({
      choices: [
        {
          message: {
            content: [
              { type: 'image_url', image_url: { url: 'x' } },
              { type: 'text', text: 'keep-' },
              { type: 'image_url', image_url: { url: 'y' } },
              { type: 'text', text: 'me' },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({ ok: true, text: 'keep-me' });
  });

  it('rejects an empty content string as malformed', async () => {
    const result = await analyzeBody({ choices: [{ message: { content: '' } }] });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects an empty content array as malformed', async () => {
    const result = await analyzeBody({ choices: [{ message: { content: [] } }] });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a content array containing only non-text parts', async () => {
    const result = await analyzeBody({
      choices: [
        {
          message: {
            content: [
              { type: 'image_url', image_url: { url: 'x' } },
              { type: 'audio', audio: 'ignored' },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a refusal-only first choice', async () => {
    const result = await analyzeBody({
      choices: [{ message: { content: null, refusal: 'I cannot analyze this.' } }],
    });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a tool-calls-only first choice', async () => {
    const result = await analyzeBody({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'x', arguments: '{}' },
              },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects an audio-only first choice', async () => {
    const result = await analyzeBody({
      choices: [{ message: { content: null, audio: { id: 'audio_1', data: 'b64' } } }],
    });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects an empty choices array', async () => {
    const result = await analyzeBody({ choices: [] });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a body without a choices field', async () => {
    const result = await analyzeBody({ id: 'x', object: 'chat.completion' });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a first choice without a message', async () => {
    const result = await analyzeBody({ choices: [{ finish_reason: 'stop' }] });
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects a null body', async () => {
    const result = await analyzeBody(null);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('rejects an array body (choices not present)', async () => {
    const result = await analyzeBody([{ not: 'an object response' }]);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('uses only the first choice when more than one is present', async () => {
    const result = await analyzeBody({
      choices: [{ message: { content: 'first' } }, { message: { content: 'second' } }],
    });
    expect(result).toEqual({ ok: true, text: 'first' });
  });
});

describe('analyze error containment', () => {
  it('does not leak a 5xx response body into the error string', async () => {
    mock = await startMockProvider();
    // 502 is a retriable 5xx — 3 total attempts with real 1s+2s backoff.
    // Set up a sequence so every attempt returns the same leaking body.
    mock.setResponseSequence([
      { status: 502, body: { error: 'leak: api_key=sk-1234567890abcdef' } },
      { status: 502, body: { error: 'leak: api_key=sk-1234567890abcdef' } },
      { status: 502, body: { error: 'leak: api_key=sk-1234567890abcdef' } },
    ]);
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
    expect(mock.requests).toHaveLength(3);
    if (!result.ok) {
      expect(result.error).toBe('provider request failed');
      expect(result.error).not.toMatch(/sk-|api_key|leak/i);
    }
  }, 10_000);

  it('does not leak a refusal body into the malformed-response error string', async () => {
    mock = await startMockProvider({
      body: {
        choices: [{ message: { content: null, refusal: 'I cannot help with secret sk-XYZ' } }],
      },
    });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('does not leak a tool-calls body into the malformed-response error string', async () => {
    mock = await startMockProvider({
      body: {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_secret',
                  type: 'function',
                  function: { name: 'steal', arguments: '{"secret":"sk-LEAK"}' },
                },
              ],
            },
          },
        ],
      },
    });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
  });

  it('does not leak a 2xx non-JSON body into the malformed-response error string', async () => {
    mock = await startMockProvider({
      status: 200,
      body: '<html>secret sk-LEAK in body</html>',
    });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: false, error: 'malformed provider response' });
    if (!result.ok) {
      expect(result.error).not.toMatch(/sk-LEAK|secret|html/i);
    }
  });
});

describe('analyze non-retry behavior', () => {
  // The retry mechanism exists (see provider-retry.test.ts), but permanent
  // failures like malformed responses, 4xx (non-429/408), and 2xx non-JSON
  // bodies must still return after exactly ONE attempt. These tests verify
  // the non-retry contract for permanent failures.

  it('calls the provider exactly once for a malformed-response body', async () => {
    mock = await startMockProvider({
      body: { choices: [{ message: { content: null, refusal: 'no' } }] },
    });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
    expect(mock.requests).toHaveLength(1);
  });

  it('calls the provider exactly once for a non-2xx response', async () => {
    // 400 is a permanent failure — not retried.
    mock = await startMockProvider({ status: 400, body: { error: 'boom' } });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
    expect(mock.requests).toHaveLength(1);
  });

  it('calls the provider exactly once for a 2xx non-JSON body', async () => {
    mock = await startMockProvider({ status: 200, body: '<html>not json</html>' });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
    expect(mock.requests).toHaveLength(1);
  });

  it('calls the provider exactly once for a successful response', async () => {
    mock = await startMockProvider();
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result).toEqual({ ok: true, text: 'mock analysis result' });
    expect(mock.requests).toHaveLength(1);
  });
});
