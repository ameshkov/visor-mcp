import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `analyze_data_visualization` is reserved for future work. The fixture
 * uses a bar-chart PNG (four colored bars of increasing height) so the
 * arguments reflect the tool's real purpose. The handler must reject
 * calls with a sanitized not-implemented error.
 */
export default {
  tool: 'analyze_data_visualization',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with a bar-chart image returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        image_source: pngDataUrl('bar-chart.png'),
        prompt: 'summarize the trends shown in this chart',
        analysis_focus: 'anomalies',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
