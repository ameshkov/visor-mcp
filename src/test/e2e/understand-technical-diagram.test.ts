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
} from '../utils/index.js';
import { UNDERSTAND_TECHNICAL_DIAGRAM_PROMPT } from '../../server/tools/understand-technical-diagram.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    VISION_MCP_API_KEY: 'test-key',
    VISION_MCP_BASE_URL: baseUrl,
    VISION_MCP_MODEL: 'test-model',
  };
}

describe('understand_technical_diagram over stdio', () => {
  it('appends the diagram_type_hint tag to the user text when diagram_type is supplied', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'understand_technical_diagram',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'explain the components, data flow, and decisions',
        diagram_type: 'flowchart',
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
    expect(messages[0].content).toBe(UNDERSTAND_TECHNICAL_DIAGRAM_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    const url = (content[0].image_url as Record<string, string>).url;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(content[1]).toEqual({
      type: 'text',
      text: 'explain the components, data flow, and decisions\n\n<diagram_type_hint>This is a flowchart diagram.</diagram_type_hint>',
    });
  }, 20000);

  it('uses the prompt unchanged when diagram_type is omitted', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'understand_technical_diagram',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'explain the components, data flow, and decisions',
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
    expect(messages[0].content).toBe(UNDERSTAND_TECHNICAL_DIAGRAM_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    expect(content[1]).toEqual({
      type: 'text',
      text: 'explain the components, data flow, and decisions',
    });
  }, 20000);

  it('rejects a whitespace-only diagram_type without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'understand_technical_diagram',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'explain the components, data flow, and decisions',
        diagram_type: '   ',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);
});
