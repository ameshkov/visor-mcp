import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `ui_diff_check` is reserved for future work. The fixture uses two UI
 * screenshots that differ only in the button color (blue expected vs red
 * actual) so the arguments reflect the tool's comparison purpose. The
 * handler must reject calls with a sanitized not-implemented error.
 */
export default {
  tool: 'ui_diff_check',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with expected and actual UI screenshots returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        expected_image_source: pngDataUrl('ui-diff-a.png'),
        actual_image_source: pngDataUrl('ui-diff-b.png'),
        prompt: 'compare the expected and actual UIs and list the differences',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
