import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../../config/index.js';
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
    mock = await startMockProvider({ status: 500, body: { error: 'boom' } });
    const result = await analyze(configFor(mock.url), REQUEST);
    expect(result.ok).toBe(false);
  });

  it('returns an error when the provider is unreachable', async () => {
    const result = await analyze(configFor('http://127.0.0.1:1'), REQUEST);
    expect(result.ok).toBe(false);
  });
});
