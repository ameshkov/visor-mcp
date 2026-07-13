import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `analyze_data_visualization` analyzes charts, graphs, and dashboards.
 * The non-live cases exercise input validation paths that never reach the
 * provider, so they run without an API key. The live case sends a
 * bar-chart PNG to the real provider and asserts the response mentions a
 * chart-related keyword.
 */
export default {
  tool: 'analyze_data_visualization',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: {
        image_source: 'not a source',
        prompt: 'summarize the trends shown in this chart',
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
        prompt: 'summarize the trends shown in this chart',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'recognizes the bar chart (live)',
      description:
        'Sends the bar-chart PNG to the real provider and asserts the response mentions a chart-related keyword (chart/graph/bar/trend). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('bar-chart.png'),
        prompt:
          'Analyze this chart. If you can identify the visualization, include the word CHART in your response.',
        analysis_focus: 'trends',
      },
      assert({ result }) {
        expectKeyword(result, ['chart', 'graph', 'bar', 'trend']);
      },
    },
  ],
} satisfies ToolFixture;
