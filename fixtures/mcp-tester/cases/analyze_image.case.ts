import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `analyze_image` is the only tool with a real handler. The non-live cases
 * exercise input validation paths that never reach the provider, so they
 * run without an API key. The live case makes a real provider call and is
 * gated on `MCP_TESTER_LIVE=1`; it verifies the model actually recognized
 * the image content by asserting the response mentions a subject keyword.
 */
export default {
  tool: 'analyze_image',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: { image_source: 'not a source', prompt: 'describe this image' },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'ignores an unknown argument',
      description:
        'Unknown fields are stripped rather than rejected at schema validation, so the handler runs. With a non-image source in a non-live run, the call fails at the image loader with a sanitized handler error (an `Error:` prefix, not an SDK validation message), proving the extra field was accepted past validation.',
      arguments: {
        image_source: 'not a source',
        prompt: 'x',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'recognizes the smiley face (live)',
      description:
        'Sends the smiley-face PNG to the real provider and asserts the response mentions a subject keyword (smile/face/happy/smiley) rather than just being non-empty. Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('smiley.png'),
        prompt:
          'Describe what you see in this image. If you can identify the subject, include the word SMILEY in your response.',
      },
      assert({ result }) {
        expectKeyword(result, ['smile', 'face', 'happy', 'smiley']);
      },
    },
  ],
} satisfies ToolFixture;
