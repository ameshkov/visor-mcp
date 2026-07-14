import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `extract_text_from_screenshot` performs OCR on screenshots of code,
 * terminals, configuration, and prose. The non-live cases exercise input
 * validation paths that never reach the provider, so they run without an API
 * key. The live case sends a screenshot rendering "HELLO WORLD" and asserts
 * the response mentions the recognized text.
 */
export default {
  tool: 'extract_text_from_screenshot',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: {
        image_source: 'not a source',
        prompt: 'extract the text shown in this screenshot',
        programming_language: 'typescript',
      },
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
        prompt: 'extract the text',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'extracts HELLO WORLD (live)',
      description:
        'Sends the text screenshot to the real provider and asserts the response mentions the recognized text (hello/world). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('text-screenshot.png'),
        prompt: 'Extract the visible text verbatim.',
        programming_language: 'typescript',
      },
      assert({ result }) {
        expectKeyword(result, ['hello', 'world']);
      },
    },
  ],
} satisfies ToolFixture;
