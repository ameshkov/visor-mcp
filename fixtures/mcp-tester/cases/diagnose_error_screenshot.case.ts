import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `diagnose_error_screenshot` is reserved for future work. The fixture
 * uses a screenshot of an error dialog (a warning triangle with an
 * exclamation mark inside a window with a red title bar) so the
 * arguments reflect the tool's real purpose. The handler must reject
 * calls with a sanitized not-implemented error.
 */
export default {
  tool: 'diagnose_error_screenshot',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with an error-dialog screenshot returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        image_source: pngDataUrl('error-dialog.png'),
        prompt: 'what caused this error and how do I fix it',
        context: 'running under node 24',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
