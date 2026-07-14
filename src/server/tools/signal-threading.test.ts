import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../../config/index.js';

// Mock `loadImage` and `analyze` so the handler tests can assert signal
// threading without real I/O. The mocks resolve to trivial values; the
// assertions verify only that the caller-supplied `signal` reaches them as
// the trailing argument. Mocking the `services` barrel covers both the
// `runImageAnalysis`/`runDualImageAnalysis` helpers and the seven tool
// handler closures, which all import from `../../services/index.js`.
vi.mock('../../services/index.js', () => ({
  loadImage: vi.fn(async () => ({
    mimeType: 'image/png',
    bytes: new Uint8Array(),
    dataUrl: 'data:image/png;base64,',
  })),
  analyze: vi.fn(async () => ({ ok: true, text: 'ok' })),
}));

import { loadImage, analyze } from '../../services/index.js';
import { runImageAnalysis, runDualImageAnalysis } from './common.js';
import { TOOLS } from './index.js';

const config: ServerConfig = {
  apiKey: 'k',
  baseUrl: 'http://x',
  model: 'm',
  maxImageSizeMb: 5,
  requestTimeoutMs: 60_000,
  requestBodyExtras: {},
  chatCompletionsEndpoint: 'http://x/chat/completions',
};

beforeEach(() => {
  vi.mocked(loadImage).mockClear();
  vi.mocked(analyze).mockClear();
});

describe('runImageAnalysis signal threading', () => {
  it('forwards the signal to loadImage and analyze', async () => {
    const controller = new AbortController();
    await runImageAnalysis(config, 'src', { systemPrompt: 's', userText: 'u' }, controller.signal);
    expect(loadImage).toHaveBeenCalledWith('src', 5, 60_000, controller.signal);
    expect(analyze).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ systemPrompt: 's', userText: 'u' }),
      controller.signal,
    );
  });
});

describe('runDualImageAnalysis signal threading', () => {
  it('forwards an abort-propagating signal to both concurrent loadImage calls and the external signal to analyze', async () => {
    const controller = new AbortController();
    await runDualImageAnalysis(
      config,
      { expected: 'e', actual: 'a' },
      { systemPrompt: 's', userText: 'u' },
      controller.signal,
    );
    // The two loads run concurrently and each receives a local AbortSignal
    // that propagates an external abort (and cancels the peer on failure);
    // analyze still receives the external signal directly.
    expect(loadImage).toHaveBeenCalledWith('e', 5, 60_000, expect.any(AbortSignal));
    expect(loadImage).toHaveBeenCalledWith('a', 5, 60_000, expect.any(AbortSignal));
    expect(analyze).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ systemPrompt: 's', userText: 'u' }),
      controller.signal,
    );
  });

  it('propagates an already-aborted external signal as an aborted local signal to both loads', async () => {
    const controller = new AbortController();
    controller.abort();
    await runDualImageAnalysis(
      config,
      { expected: 'e', actual: 'a' },
      { systemPrompt: 's', userText: 'u' },
      controller.signal,
    );
    // The mocked `loadImage` ignores the signal and resolves, so the call
    // returns normally; this asserts only that a pre-aborted external signal
    // yields a pre-aborted local signal for both concurrent loads.
    const expected = vi.mocked(loadImage).mock.calls[0]!;
    const actual = vi.mocked(loadImage).mock.calls[1]!;
    expect((expected[3] as AbortSignal).aborted).toBe(true);
    expect((actual[3] as AbortSignal).aborted).toBe(true);
  });
});

/**
 * The captured callback's expected shape:
 * `(args, extra) => Promise<CallToolResult>`. The `extra` parameter is the
 * narrow `{ signal }` subset of the SDK's `RequestHandlerExtra` that
 * Step 3A introduces as `ToolHandlerExtra` in `common.ts`; the inline
 * structural type keeps the test self-contained without importing the
 * (not-yet-existing at Step 1) export.
 */
type CapturedHandler = (
  args: unknown,
  extra: { readonly signal: AbortSignal },
) => Promise<CallToolResult>;

/**
 * Minimal fake `McpServer`: its `registerTool(name, _config, cb)` records
 * the registered callback so a test can invoke it directly with
 * `(args, { signal })`. The real `McpServer.registerTool` signature is
 * matched structurally; each `Tool.register(server, config)` only invokes
 * `server.registerTool(name, { description, inputSchema }, cb)`, so a fake
 * exposing only that method is sufficient.
 */
function captureCallback(): {
  readonly registerTool: (name: string, config: unknown, cb: CapturedHandler) => void;
  readonly captured: CapturedHandler[];
} {
  const captured: CapturedHandler[] = [];
  return {
    registerTool: (_name, _config, cb) => {
      captured.push(cb);
    },
    captured,
  };
}

/** Per-tool minimal valid args. Keyed by the tool's `name`. */
const TOOL_ARGS: Record<string, Record<string, string>> = {
  analyze_image: { image_source: 's', prompt: 'u' },
  ui_to_artifact: { image_source: 's', output_type: 'code', prompt: 'u' },
  extract_text_from_screenshot: {
    image_source: 's',
    prompt: 'u',
    programming_language: 'ts',
  },
  diagnose_error_screenshot: { image_source: 's', prompt: 'u', context: 'c' },
  understand_technical_diagram: {
    image_source: 's',
    prompt: 'u',
    diagram_type: 'flowchart',
  },
  analyze_data_visualization: {
    image_source: 's',
    prompt: 'u',
    analysis_focus: 'trends',
  },
  ui_diff_check: {
    expected_image_source: 'e',
    actual_image_source: 'a',
    prompt: 'u',
  },
};

describe('tool handlers thread extra.signal', () => {
  it.each(TOOLS.map((t) => [t.name] as const))(
    '%s registers a handler that forwards extra.signal to loadImage and analyze',
    async (name) => {
      const tool = TOOLS.find((t) => t.name === name)!;
      const fake = captureCallback();
      tool.register(fake as unknown as McpServer, config);
      expect(fake.captured).toHaveLength(1);
      const controller = new AbortController();
      await fake.captured[0](TOOL_ARGS[name], { signal: controller.signal });
      // Single-image tools call loadImage once; ui_diff_check calls it twice
      // (expected then actual). Assert the signal reached at least the first
      // loadImage invocation and the analyze call. Single-image tools forward
      // the external signal directly; ui_diff_check forwards a local signal
      // derived from it (see runDualImageAnalysis), so match any AbortSignal.
      expect(loadImage).toHaveBeenCalledWith(
        expect.any(String),
        5,
        60_000,
        expect.any(AbortSignal),
      );
      expect(analyze).toHaveBeenCalledWith(config, expect.any(Object), controller.signal);
    },
  );
});
