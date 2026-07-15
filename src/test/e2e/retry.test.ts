import { describe, it, expect, afterEach } from 'vitest';
import {
  baseEnv,
  init,
  kill,
  lineReader,
  request,
  spawnServer,
  startMockProvider,
  TINY_PNG_DATA_URL,
  type MockProvider,
} from '../utils/index.js';

let mock: MockProvider | undefined;
let child: ReturnType<typeof spawnServer> | undefined;

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

describe('analyze_image end-to-end retry', () => {
  it('succeeds after one provider retry (real backoff)', async () => {
    // This test pays the real ~3s of 1s+2s retry delays because the server
    // process owns its own event loop — fake timers cannot reach it.
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'busy' } },
      {
        status: 200,
        body: { choices: [{ message: { content: 'mock analysis result' } }] },
      },
    ]);
    child = spawnServer(envWithProvider(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);
    const result = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'describe',
      },
    });
    const callResult = result.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(callResult.isError).toBeFalsy();
    const text = callResult.content[0].text;
    expect(text).toBe('mock analysis result');
    expect(mock.requests).toHaveLength(2);
  }, 15_000);

  it('returns one sanitized MCP error after retries are exhausted', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'leak: api_key=sk-SECRET' } },
      { status: 503, body: { error: 'leak: api_key=sk-SECRET' } },
      { status: 503, body: { error: 'leak: api_key=sk-SECRET' } },
    ]);
    child = spawnServer(envWithProvider(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);
    const result = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'describe',
      },
    });
    const callResult = result.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(callResult.isError).toBe(true);
    const text = callResult.content[0].text;
    expect(text).toBe('Error: provider request failed');
    expect(text).not.toMatch(/sk-|api_key|leak|secret/i);
    expect(mock.requests).toHaveLength(3);
  }, 15_000);
});
