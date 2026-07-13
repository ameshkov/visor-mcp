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
  startMockImageServer,
  type MockImageServer,
  TINY_PNG_DATA_URL,
  TINY_PNG_BASE64,
  TINY_PNG_BYTES,
  writeTempFile,
  createTempDir,
} from '../utils/index.js';
import { ANALYZE_IMAGE_PROMPT } from '../../server/tools/analyze-image.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let mock: MockProvider | undefined;
let child: ChildProcess | undefined;
let imageServer: MockImageServer | undefined;

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
  if (imageServer) {
    await imageServer.close();
    imageServer = undefined;
  }
});

function envFor(baseUrl: string): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    VISION_MCP_API_KEY: 'test-key',
    VISION_MCP_BASE_URL: baseUrl,
    VISION_MCP_MODEL: 'test-model',
  };
}

describe('analyze_image over stdio', () => {
  it('returns one text item and sends one inline image plus one text part to the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: TINY_PNG_DATA_URL, prompt: 'describe this image' },
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
    expect(messages[0].content).toBe(ANALYZE_IMAGE_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    const url = (content[0].image_url as Record<string, string>).url;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(content[1]).toEqual({ type: 'text', text: 'describe this image' });
  }, 20000);

  it('rejects an unsupported image source without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: 'ftp://example.test/a.png', prompt: 'describe this image' },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);

  it('analyzes an absolute local PNG file end to end', async () => {
    const file = writeTempFile(TINY_PNG_BYTES);
    try {
      mock = await startMockProvider();
      child = spawnServer(envFor(mock.url));
      const read = lineReader(child.stdout!);
      await init(child, read);

      const call = await request(child, read, 'tools/call', {
        name: 'analyze_image',
        arguments: { image_source: file.path, prompt: 'describe this image' },
      });
      const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('mock analysis result');

      expect(mock!.requests).toHaveLength(1);
      const captured = mock!.requests[0];
      expect(captured.method).toBe('POST');
      expect(captured.path).toBe('/chat/completions');
      const messages = (captured.body as Record<string, unknown>).messages as Array<
        Record<string, unknown>
      >;
      const content = messages[1].content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('image_url');
      const url = (content[0].image_url as Record<string, string>).url;
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
      expect(Buffer.from(url.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
      expect(content[1]).toEqual({ type: 'text', text: 'describe this image' });
    } finally {
      file.cleanup();
    }
  }, 20000);

  it('rejects a relative local path without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: 'relative.png', prompt: 'describe this image' },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);

  it('rejects a directory path without calling the provider', async () => {
    const dir = createTempDir('vision-mcp-int-');
    try {
      mock = await startMockProvider();
      child = spawnServer(envFor(mock.url));
      const read = lineReader(child.stdout!);
      await init(child, read);

      const call = await request(child, read, 'tools/call', {
        name: 'analyze_image',
        arguments: { image_source: dir.path, prompt: 'describe this image' },
      });
      const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^Error:/);
      expect(mock!.requests).toHaveLength(0);
    } finally {
      dir.cleanup();
    }
  }, 20000);

  it('rejects a missing absolute path without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: {
        image_source: `/nonexistent-vision-mcp-${Date.now()}.png`,
        prompt: 'describe this image',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);

  it('analyzes an HTTP image URL end to end', async () => {
    imageServer = await startMockImageServer();
    imageServer.setRoute('/img', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: `${imageServer.url}/img`, prompt: 'describe this image' },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('mock analysis result');

    expect(imageServer.requests).toHaveLength(1);
    expect(imageServer.requests[0].method).toBe('GET');
    expect(imageServer.requests[0].authorization).toBeUndefined();
    expect(mock!.requests).toHaveLength(1);
    const captured = mock!.requests[0];
    expect(captured.method).toBe('POST');
    expect(captured.path).toBe('/chat/completions');
    const messages = (captured.body as Record<string, unknown>).messages as Array<
      Record<string, unknown>
    >;
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    const url = (content[0].image_url as Record<string, string>).url;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(content[1]).toEqual({ type: 'text', text: 'describe this image' });
  }, 20000);

  it('rejects an HTTP image URL that fails to fetch without calling the provider', async () => {
    imageServer = await startMockImageServer();
    imageServer.setRoute('/gone', { status: 404 });
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: `${imageServer.url}/gone`, prompt: 'describe this image' },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);

  it('rejects a data URL with a declared MIME mismatch without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: {
        image_source: `data:image/jpeg;base64,${TINY_PNG_BASE64}`,
        prompt: 'describe this image',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);
    expect(result.content[0].text).toMatch(/declared format/);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);
});
