import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `ui_diff_check` compares an expected/reference UI screenshot with an actual
 * implementation. The non-live cases exercise the dual image loader's
 * validation path (an invalid expected source fails before the provider is
 * contacted), so they run without an API key. The live case sends two UIs
 * that differ only in button color and asserts the response mentions a
 * difference keyword.
 */
export default {
  tool: 'ui_diff_check',
  cases: [
    {
      name: 'rejects a non-image expected source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the dual loader must return a sanitized handler error without calling the provider, even when the actual source is a valid image.',
      arguments: {
        expected_image_source: 'not a source',
        actual_image_source: pngDataUrl('ui-diff-a.png'),
        prompt: 'compare the expected and actual UIs and list the differences',
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'ignores an unknown argument',
      description:
        'Unknown fields are stripped rather than rejected at schema validation, so the handler runs. With a non-image expected source in a non-live run, the call fails at the dual loader with a sanitized handler error (an `Error:` prefix, not an SDK validation message), proving the extra field was accepted past validation.',
      arguments: {
        expected_image_source: 'not a source',
        actual_image_source: pngDataUrl('ui-diff-a.png'),
        prompt: 'compare the two UIs',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'spots the button color difference (live)',
      description:
        'Sends the two UI screenshots (identical except blue vs red button) to the real provider and asserts the response mentions a difference keyword (button/color/blue/red/difference). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        expected_image_source: pngDataUrl('ui-diff-a.png'),
        actual_image_source: pngDataUrl('ui-diff-b.png'),
        prompt:
          'Compare these two UIs and list the differences. If you see a color change, include the word COLOR in your response.',
      },
      assert({ result }) {
        expectKeyword(result, ['button', 'color', 'blue', 'red', 'difference', 'differ']);
      },
    },
  ],
} satisfies ToolFixture;
