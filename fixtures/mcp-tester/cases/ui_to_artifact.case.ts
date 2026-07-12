import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `ui_to_artifact` is reserved for future work. The fixture uses a login
 * form screenshot (a window with a title bar, input fields, and a submit
 * button) so the arguments reflect the tool's UI-conversion purpose. The
 * handler must reject calls with a sanitized not-implemented error
 * rather than reaching the provider.
 */
export default {
  tool: 'ui_to_artifact',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with a UI form screenshot returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        image_source: pngDataUrl('ui-form.png'),
        output_type: 'code',
        prompt: 'convert this UI form to a React component',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
