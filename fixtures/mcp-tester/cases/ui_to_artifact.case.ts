import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `ui_to_artifact` converts a UI screenshot into frontend code, an AI
 * recreation prompt, a design specification, or a natural-language
 * description (selected via `output_type`). The non-live cases exercise
 * input validation paths that never reach the provider, so they run without
 * an API key. The live case sends a login-form screenshot and asserts the
 * response mentions a UI keyword.
 */
export default {
  tool: 'ui_to_artifact',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: {
        image_source: 'not a source',
        output_type: 'code',
        prompt: 'convert this UI form to a React component',
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
        output_type: 'description',
        prompt: 'describe this UI',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'describes the login form (live)',
      description:
        'Sends the login-form PNG to the real provider with output_type="description" and asserts the response mentions a UI keyword (form/input/button/login/field). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('ui-form.png'),
        output_type: 'description',
        prompt:
          'Describe this interface. If you can identify it, include the word FORM in your response.',
      },
      assert({ result }) {
        expectKeyword(result, ['form', 'input', 'button', 'login', 'field']);
      },
    },
  ],
} satisfies ToolFixture;
