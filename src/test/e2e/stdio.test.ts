import { describe, it, expect } from 'vitest';
import { baseEnv, spawnServer, lineReader, request, init, kill } from '../utils/index.js';

const validEnv: NodeJS.ProcessEnv = {
  ...baseEnv,
  VISION_MCP_API_KEY: 'test-key',
  VISION_MCP_BASE_URL: 'https://example.test/v1',
  VISION_MCP_MODEL: 'test-model',
};

describe('stdio discovery', () => {
  it('advertises exactly the seven tool contracts over stdio', async () => {
    const child = spawnServer(validEnv);
    const read = lineReader(child.stdout!);
    await init(child, read);

    const list = await request(child, read, 'tools/list', {});
    const tools = (list.result as { tools: Array<Record<string, unknown>> }).tools;
    const names = tools.map((t) => t.name as string);
    expect(names).toHaveLength(7);
    expect(names).not.toContain('analyze_video');
    expect(names).toEqual([
      'ui_diff_check',
      'ui_to_artifact',
      'extract_text_from_screenshot',
      'diagnose_error_screenshot',
      'understand_technical_diagram',
      'analyze_image',
      'analyze_data_visualization',
    ]);

    const artifact = tools.find((t) => t.name === 'ui_to_artifact') as Record<string, unknown>;
    const inputSchema = artifact.inputSchema as Record<string, unknown>;
    expect(artifact.description).toBe(
      `Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description, selected via output_type.

Use this tool ONLY when the user wants to:
- Generate frontend code from a UI design (output_type='code')
- Create an AI prompt that recreates the UI (output_type='prompt')
- Extract a design specification document (output_type='spec')
- Get a natural-language description of the UI (output_type='description')

Do NOT use for: OCR/text extraction, error diagnosis, technical diagrams, or data visualizations.`,
    );
    expect(inputSchema.type).toBe('object');
    expect(inputSchema.additionalProperties).toBe(false);
    const props = inputSchema.properties as Record<string, Record<string, unknown>>;
    for (const field of ['image_source', 'output_type', 'prompt']) {
      expect(typeof props[field].description).toBe('string');
      expect((props[field].description as string).length).toBeGreaterThan(0);
    }
    expect((props.output_type as Record<string, unknown>).enum).toEqual([
      'code',
      'prompt',
      'spec',
      'description',
    ]);
    expect(inputSchema.required).toEqual(
      expect.arrayContaining(['image_source', 'output_type', 'prompt']),
    );

    await kill(child);
  }, 20000);

  it('returns an error for a non-data-URL image source', async () => {
    // `example.test` fails DNS resolution (ENOTFOUND), which under the
    // retry policy is a retriable connection failure: 3 attempts + a real
    // 1 s + 2 s backoff ≈ 3 s before `Error: image download failed`
    // surfaces. The spawned server runs its own event loop, so fake timers
    // cannot reach it. The regression is bounded and acceptable; the 20 s
    // per-test timeout covers it.
    const child = spawnServer(validEnv);
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: 'https://example.test/a.png', prompt: 'describe this image' },
    });
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);

    await kill(child);
  }, 20000);

  it('strips unknown fields and rejects an invalid image source at the handler', async () => {
    const child = spawnServer(validEnv);
    const read = lineReader(child.stdout!);
    await init(child, read);

    const call = await request(child, read, 'tools/call', {
      name: 'analyze_image',
      arguments: { image_source: 'x', prompt: 'y', unknown_field: 1 },
    });
    // Unknown fields are stripped rather than rejected at validation, so the
    // handler runs and rejects the relative image source itself; the result
    // is a handler error (`Error:` prefix), not an SDK validation rejection.
    const result = call.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error:/);

    await kill(child);
  }, 20000);

  it('keeps stdout free of non-protocol output during normal operation', async () => {
    const child = spawnServer(validEnv);
    const read = lineReader(child.stdout!);
    // Every line read by `request` is JSON.parsed; a non-JSON line throws and
    // fails this test, asserting stdout contains only JSON-RPC messages.
    await init(child, read);
    await request(child, read, 'tools/list', {});
    await kill(child);
  }, 20000);
});

describe('stdio startup failure', () => {
  it('exits nonzero with stderr only when a required value is missing', async () => {
    const child = spawnServer({
      ...baseEnv,
      VISION_MCP_API_KEY: '',
      VISION_MCP_BASE_URL: 'https://example.test/v1',
      VISION_MCP_MODEL: 'test-model',
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 0)));
    expect(code).not.toBe(0);
    expect(Buffer.concat(stdout).toString('utf8')).toBe('');
    expect(Buffer.concat(stderr).toString('utf8')).toMatch(/Error:/);
  }, 20000);

  it('does not leak the API key in stderr on invalid configuration', async () => {
    const child = spawnServer({
      ...baseEnv,
      VISION_MCP_API_KEY: 'secret-key-value',
      VISION_MCP_BASE_URL: 'ftp://example.test',
      VISION_MCP_MODEL: 'test-model',
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 0)));
    expect(code).not.toBe(0);
    const stderrText = Buffer.concat(stderr).toString('utf8');
    expect(stderrText).toMatch(/Error:/);
    expect(stderrText).not.toContain('secret-key-value');
    expect(Buffer.concat(stdout).toString('utf8')).toBe('');
  }, 20000);
});
