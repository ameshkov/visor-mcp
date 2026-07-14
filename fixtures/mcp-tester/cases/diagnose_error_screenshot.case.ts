import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `diagnose_error_screenshot` diagnoses error messages, stack traces, and
 * exception screenshots. The non-live cases exercise input validation paths
 * that never reach the provider, so they run without an API key. The live
 * case sends an error-dialog screenshot and asserts the response mentions an
 * error keyword.
 */
export default {
  tool: 'diagnose_error_screenshot',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: {
        image_source: 'not a source',
        prompt: 'what caused this error and how do I fix it',
        context: 'running under node 24',
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
        prompt: 'what caused this error',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'diagnoses the error dialog (live)',
      description:
        'Sends the error-dialog PNG to the real provider and asserts the response mentions an error keyword (error/warning/exclamation/triangle/alert). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('error-dialog.png'),
        prompt:
          'Diagnose this error. If you can identify the dialog type, include the word WARNING in your response.',
        context: 'running under node 24',
      },
      assert({ result }) {
        expectKeyword(result, ['error', 'warning', 'exclamation', 'triangle', 'alert']);
      },
    },
  ],
} satisfies ToolFixture;
