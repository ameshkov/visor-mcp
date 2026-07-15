import { describe, it, expect, afterEach } from 'vitest';
import { type ChildProcess } from 'node:child_process';
import { Buffer } from 'node:buffer';
import {
  baseEnv,
  spawnServer,
  lineReader,
  request,
  init,
  startMockProvider,
  type MockProvider,
  TINY_PNG_DATA_URL,
  TINY_JPEG_DATA_URL,
} from '../utils/index.js';
import { UI_DIFF_CHECK_PROMPT } from '../../server/tools/ui-diff-check.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

let mock: MockProvider | undefined;
let child: ChildProcess | undefined;

afterEach(async () => {
  if (child) {
    child.kill();
    await new Promise<void>((r) => child!.once('exit', () => r()));
    child = undefined;
  }
  if (mock) {
    await mock.close();
    mock = undefined;
  }
});

function envFor(baseUrl: string): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    VISOR_MCP_API_KEY: 'test-key',
    VISOR_MCP_BASE_URL: baseUrl,
    VISOR_MCP_MODEL: 'test-model',
  };
}

const PROMPT = 'list the visual differences between expected and actual';
const EXPECTED_USER_TEXT = `<images>
<image>First image is the EXPECTED/REFERENCE target.</image>
<image>Second image is the ACTUAL/CURRENT implementation.</image>
</images>

${PROMPT}`;

describe('ui_diff_check over stdio', () => {
  it('sends expected first, actual second, prefixed role block, and one text result', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'ui_diff_check',
      arguments: {
        expected_image_source: TINY_PNG_DATA_URL,
        actual_image_source: TINY_JPEG_DATA_URL,
        prompt: PROMPT,
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('mock analysis result');

    expect(mock!.requests).toHaveLength(1);
    const captured = mock!.requests[0];
    expect(captured.method).toBe('POST');
    expect(captured.path).toBe('/chat/completions');
    expect(captured.authorization).toBe('Bearer test-key');
    const body = captured.body as Record<string, unknown>;
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(UI_DIFF_CHECK_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(3);
    expect(content[0].type).toBe('image_url');
    const expectedUrl = (content[0].image_url as Record<string, string>).url;
    expect(expectedUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(expectedUrl.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(content[0].image_url).not.toHaveProperty('detail');
    expect(content[1].type).toBe('image_url');
    const actualUrl = (content[1].image_url as Record<string, string>).url;
    expect(actualUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(Buffer.from(actualUrl.split(',')[1], 'base64').subarray(0, 3)).toEqual(JPEG_SIGNATURE);
    expect(content[1].image_url).not.toHaveProperty('detail');
    expect(content[2]).toEqual({ type: 'text', text: EXPECTED_USER_TEXT });
  }, 20000);

  it('fails atomically when the expected image source is invalid and calls no provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'ui_diff_check',
      arguments: {
        expected_image_source: 'ftp://example.test/expected.png',
        actual_image_source: TINY_JPEG_DATA_URL,
        prompt: 'compare them',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);

  it('fails atomically when the actual image source is invalid and calls no provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'ui_diff_check',
      arguments: {
        expected_image_source: TINY_PNG_DATA_URL,
        actual_image_source: 'ftp://example.test/actual.png',
        prompt: 'compare them',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);
});
