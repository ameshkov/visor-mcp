import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `extract_text_from_screenshot` is reserved for future work. The
 * fixture uses a screenshot containing the text "HELLO WORLD" rendered
 * in white on a dark background, so the arguments reflect the tool's
 * OCR purpose. The handler must reject calls with a sanitized
 * not-implemented error.
 */
export default {
  tool: 'extract_text_from_screenshot',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with a text screenshot returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        image_source: pngDataUrl('text-screenshot.png'),
        prompt: 'extract the text shown in this screenshot',
        programming_language: 'typescript',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
