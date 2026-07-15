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
import { ANALYZE_DATA_VISUALIZATION_PROMPT } from '../../server/tools/analyze-data-visualization.js';

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
    VISOR_MCP_API_KEY: 'test-key',
    VISOR_MCP_BASE_URL: baseUrl,
    VISOR_MCP_MODEL: 'test-model',
  };
}

describe('analyze_data_visualization over stdio', () => {
  it('appends the analysis_focus tag to the user text when analysis_focus is supplied', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_data_visualization',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'summarize the trends shown in this chart',
        analysis_focus: 'anomalies',
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
    expect(messages[0].content).toBe(ANALYZE_DATA_VISUALIZATION_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    const url = (content[0].image_url as Record<string, string>).url;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(content[1]).toEqual({
      type: 'text',
      text: 'summarize the trends shown in this chart\n\n<analysis_focus>Focus particularly on: anomalies.</analysis_focus>',
    });
  }, 20000);

  it('uses the prompt unchanged when analysis_focus is omitted', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_data_visualization',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'summarize the trends shown in this chart',
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
    expect(messages[0].content).toBe(ANALYZE_DATA_VISUALIZATION_PROMPT);
    expect(messages[1].role).toBe('user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('image_url');
    expect(content[1]).toEqual({
      type: 'text',
      text: 'summarize the trends shown in this chart',
    });
  }, 20000);

  it('rejects a whitespace-only analysis_focus without calling the provider', async () => {
    mock = await startMockProvider();
    child = spawnServer(envFor(mock.url));
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_data_visualization',
      arguments: {
        image_source: TINY_PNG_DATA_URL,
        prompt: 'summarize the trends shown in this chart',
        analysis_focus: '   ',
      },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(mock!.requests).toHaveLength(0);
  }, 20000);
});
