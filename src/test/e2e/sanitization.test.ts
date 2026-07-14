import { describe, it, expect, afterEach } from 'vitest';
import {
  baseEnv,
  spawnServer,
  lineReader,
  request,
  init,
  kill,
  startMockProvider,
  TINY_PNG_DATA_URL,
  TINY_PNG_BASE64,
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

/**
 * Asserts every non-empty line of `stdout` is valid JSON-RPC (so no diagnostic
 * or secret was written to stdout) and that none of the sentinel substrings
 * appear anywhere in the captured stdout buffer.
 */
function expectStdoutProtocolOnly(stdout: string, sentinels: readonly string[]): void {
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue;
    expect(() => JSON.parse(line)).not.toThrow();
  }
  for (const sentinel of sentinels) {
    expect(stdout).not.toContain(sentinel);
  }
}

describe('startup failure redacts configured secrets from stderr and keeps stdout empty', () => {
  it('does not disclose API key, model, or request-body extras on an invalid base URL', async () => {
    const API_KEY_SENTINEL = 'sk-STARTUP-APIKEY-SENTINEL';
    const MODEL_SENTINEL = 'STARTUP-MODEL-SENTINEL';
    const EXTRAS_SENTINEL = 'STARTUP-EXTRAS-SENTINEL';
    child = spawnServer({
      ...baseEnv,
      VISION_MCP_API_KEY: API_KEY_SENTINEL,
      VISION_MCP_BASE_URL: 'ftp://invalid.scheme.test',
      VISION_MCP_MODEL: MODEL_SENTINEL,
      VISION_MCP_REQUEST_BODY_JSON: `{"reasoning_effort":"high","marker":"${EXTRAS_SENTINEL}"}`,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child!.on('exit', (c) => r(c ?? 0)));
    const stdoutText = Buffer.concat(stdout).toString('utf8');
    const stderrText = Buffer.concat(stderr).toString('utf8');
    expect(code).not.toBe(0);
    expect(stdoutText).toBe('');
    expect(stderrText).toMatch(/^Error:/);
    expect(stderrText).not.toContain(API_KEY_SENTINEL);
    expect(stderrText).not.toContain(MODEL_SENTINEL);
    expect(stderrText).not.toContain(EXTRAS_SENTINEL);
    expect(stderrText).not.toContain('reasoning_effort');
    // Process already exited; clear the reference so afterEach doesn't hang on kill.
    child = undefined;
  }, 20000);
});

function envWithSentinels(
  providerBaseUrl: string,
  opts: { timeoutMs?: number } = {},
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    VISION_MCP_API_KEY: 'sk-CONFIG-APIKEY-SENTINEL',
    VISION_MCP_BASE_URL: providerBaseUrl,
    VISION_MCP_MODEL: 'CONFIG-MODEL-SENTINEL',
    ...(opts.timeoutMs !== undefined
      ? { VISION_MCP_REQUEST_TIMEOUT_MS: String(opts.timeoutMs) }
      : {}),
  };
}

describe('tool failure redacts secrets across every runtime failure path', () => {
  it('image-load failure: does not disclose the prompt, URL query, or API key', async () => {
    mock = await startMockProvider();
    child = spawnServer(envWithSentinels(mock.url));
    const read = lineReader(child.stdout!);
    const stdout: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    await init(child, read);
    const PROMPT_SENTINEL = 'PROMPT-IMAGE-SENTINEL';
    const QUERY_SENTINEL = 'QUERY-IMAGE-SENTINEL';
    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: {
        image_source: `${mock.url}/img?token=${QUERY_SENTINEL}`,
        prompt: PROMPT_SENTINEL,
      },
    });
    const result = call.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(result.content[0].text).not.toContain(PROMPT_SENTINEL);
    expect(result.content[0].text).not.toContain(QUERY_SENTINEL);
    expect(result.content[0].text).not.toContain('sk-CONFIG-APIKEY-SENTINEL');
    // The query string IS transmitted to the host (redaction is from errors,
    // not from the wire), proving the secret-bearing query is not echoed back.
    expect(mock.requests[0].method).toBe('GET');
    expect(mock.requests[0].path).toContain(QUERY_SENTINEL);
    // The provider analysis endpoint was never reached (image load failed
    // first), proving the failure short-circuits before provider dispatch.
    expect(mock.requests.some((r) => r.method === 'POST')).toBe(false);
    expectStdoutProtocolOnly(Buffer.concat(stdout).toString('utf8'), [
      PROMPT_SENTINEL,
      QUERY_SENTINEL,
      'sk-CONFIG-APIKEY-SENTINEL',
    ]);
  }, 20000);

  it('provider 5xx failure: does not disclose prompt, image bytes, API key, model, or response body', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 503, body: { error: 'leak: sk-PROVIDER-BODY-SENTINEL' } },
      { status: 503, body: { error: 'leak: sk-PROVIDER-BODY-SENTINEL' } },
      { status: 503, body: { error: 'leak: sk-PROVIDER-BODY-SENTINEL' } },
    ]);
    child = spawnServer(envWithSentinels(mock.url));
    const read = lineReader(child.stdout!);
    const stdout: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    await init(child, read);
    const PROMPT_SENTINEL = 'PROMPT-PROVIDER-SENTINEL';
    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: TINY_PNG_DATA_URL, prompt: PROMPT_SENTINEL },
    });
    const result = call.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Error: provider request failed');
    expect(result.content[0].text).not.toContain(PROMPT_SENTINEL);
    expect(result.content[0].text).not.toContain(TINY_PNG_BASE64);
    expect(result.content[0].text).not.toContain('sk-CONFIG-APIKEY-SENTINEL');
    expect(result.content[0].text).not.toContain('CONFIG-MODEL-SENTINEL');
    expect(result.content[0].text).not.toContain('sk-PROVIDER-BODY-SENTINEL');
    expect(mock.requests).toHaveLength(3);
    expectStdoutProtocolOnly(Buffer.concat(stdout).toString('utf8'), [
      PROMPT_SENTINEL,
      TINY_PNG_BASE64,
      'sk-CONFIG-APIKEY-SENTINEL',
      'CONFIG-MODEL-SENTINEL',
      'sk-PROVIDER-BODY-SENTINEL',
    ]);
  }, 15000);

  it('malformed provider response: does not disclose the response body or prompt', async () => {
    mock = await startMockProvider({
      body: {
        choices: [{ message: { content: null, refusal: 'no sk-MALFORMED-BODY-SENTINEL' } }],
      },
    });
    child = spawnServer(envWithSentinels(mock.url));
    const read = lineReader(child.stdout!);
    const stdout: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    await init(child, read);
    const PROMPT_SENTINEL = 'PROMPT-MALFORMED-SENTINEL';
    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: TINY_PNG_DATA_URL, prompt: PROMPT_SENTINEL },
    });
    const result = call.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Error: malformed provider response');
    expect(result.content[0].text).not.toContain('sk-MALFORMED-BODY-SENTINEL');
    expect(result.content[0].text).not.toContain(PROMPT_SENTINEL);
    // Malformed responses are permanent: exactly one attempt, no retry.
    expect(mock.requests).toHaveLength(1);
    expectStdoutProtocolOnly(Buffer.concat(stdout).toString('utf8'), [
      PROMPT_SENTINEL,
      'sk-MALFORMED-BODY-SENTINEL',
    ]);
  }, 20000);

  it('per-attempt timeout failure: does not disclose the prompt or API key', async () => {
    mock = await startMockProvider();
    mock.setResponseSequence([
      { status: 200, hangMs: 5_000 },
      { status: 200, hangMs: 5_000 },
      { status: 200, hangMs: 5_000 },
    ]);
    // 50 ms per-attempt timeout against a 5 s mock-side hang (a 100x margin):
    // each attempt aborts as a retriable timeout failure, but only AFTER the
    // mock fully receives the POST body and records the request inside
    // `req.on('end')` (`src/test/utils/mock-provider.ts:56-70`). Mirrors the
    // wide-margin pattern in `src/test/e2e/cancel.test.ts:42-58`
    // (hangMs: 30_000, ~100 ms wait before cancel) to avoid the body-write
    // race flagged in the plan review: with a 1 ms timeout, the abort fires
    // via `setTimeout(() => controller.abort(), timeoutMs)`
    // (`src/utils/retry.ts:109-110`) before `req.on('end')` has run, so
    // `mock.requests` could end up short of 3 entries on contended CI.
    // Three total attempts with real 1 s + 2 s backoff ~= 3.2 s. The spawned
    // server owns its own event loop, so fake timers cannot reach it (mirrors
    // retry.test.ts).
    child = spawnServer(envWithSentinels(mock.url, { timeoutMs: 50 }));
    const read = lineReader(child.stdout!);
    const stdout: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    await init(child, read);
    const PROMPT_SENTINEL = 'PROMPT-TIMEOUT-SENTINEL';
    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: TINY_PNG_DATA_URL, prompt: PROMPT_SENTINEL },
    });
    const result = call.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(result.content[0].text).not.toContain(PROMPT_SENTINEL);
    expect(result.content[0].text).not.toContain('sk-CONFIG-APIKEY-SENTINEL');
    expect(mock.requests).toHaveLength(3);
    expectStdoutProtocolOnly(Buffer.concat(stdout).toString('utf8'), [
      PROMPT_SENTINEL,
      'sk-CONFIG-APIKEY-SENTINEL',
    ]);
  }, 15000);
});

describe('validation failure uses the single-item MCP error channel and does not echo caller values', () => {
  it('does not disclose a valid image_source or prompt when a different required field is missing', async () => {
    mock = await startMockProvider();
    child = spawnServer(envWithSentinels(mock.url));
    const read = lineReader(child.stdout!);
    const stdout: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    await init(child, read);
    const IMAGE_SENTINEL = 'VALIDATION-IMAGE-SENTINEL';
    const PROMPT_SENTINEL = 'VALIDATION-PROMPT-SENTINEL';
    // `output_type` is required for ui_to_artifact; omitting it fails Zod
    // validation in the MCP SDK BEFORE the tool handler runs, so no image is
    // loaded and the provider analysis endpoint is never called. The Zod issue
    // references only the missing field path, never the values of the valid
    // `image_source` or `prompt` fields.
    const call = await request(child, read, 'tools/call', {
      name: 'ui_to_artifact',
      arguments: {
        image_source: `/abs/${IMAGE_SENTINEL}.png`,
        prompt: PROMPT_SENTINEL,
      },
    });
    const result = call.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    // The SDK converts a Zod InvalidParams failure into a single isError
    // text item. The text begins with "MCP error -32602: Input validation
    // error:" (the JSON-RPC error code prefix from the SDK's error
    // constructor) — NOT "Error:" (that prefix is reserved for server-side
    // failures routed through errorToolResult). This is the SDK-owned,
    // protocol-correct shape and satisfies AC1's single-item MCP error
    // channel for the validation path.
    expect(result.content[0].text).toContain('Input validation error:');
    expect(result.content[0].text).not.toContain(IMAGE_SENTINEL);
    expect(result.content[0].text).not.toContain(PROMPT_SENTINEL);
    // Validation gates both image load and provider dispatch: the mock
    // received zero requests (no image GET, no provider POST).
    expect(mock.requests).toHaveLength(0);
    expectStdoutProtocolOnly(Buffer.concat(stdout).toString('utf8'), [
      IMAGE_SENTINEL,
      PROMPT_SENTINEL,
    ]);
  }, 20000);
});
