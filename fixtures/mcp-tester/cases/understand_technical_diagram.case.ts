import { expectHandlerError, expectKeyword, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `understand_technical_diagram` explains architecture diagrams, flowcharts,
 * UML, and other system-design visuals. The non-live cases exercise input
 * validation paths that never reach the provider, so they run without an API
 * key. The live case sends a flowchart PNG and asserts the response mentions
 * a diagram keyword.
 */
export default {
  tool: 'understand_technical_diagram',
  cases: [
    {
      name: 'rejects a non-image image source',
      description:
        'A plain string is not a data URL, HTTP URL, or absolute path; the tool must return a sanitized handler error without calling the provider.',
      arguments: {
        image_source: 'not a source',
        prompt: 'explain this flowchart step by step',
        diagram_type: 'flowchart',
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
        prompt: 'explain this diagram',
        unknown_field: 1,
      },
      assert({ result }) {
        expectHandlerError(result);
      },
    },
    {
      name: 'explains the flowchart (live)',
      description:
        'Sends the flowchart PNG to the real provider and asserts the response mentions a diagram keyword (flowchart/flow/chart/process/decision/diamond/arrow). Skipped unless MCP_TESTER_LIVE=1.',
      live: true,
      arguments: {
        image_source: pngDataUrl('flowchart.png'),
        prompt:
          'Explain this diagram. If you can identify the diagram type, include the word FLOWCHART in your response.',
        diagram_type: 'flowchart',
      },
      assert({ result }) {
        expectKeyword(result, [
          'flowchart',
          'flow',
          'chart',
          'process',
          'decision',
          'diamond',
          'arrow',
        ]);
      },
    },
  ],
} satisfies ToolFixture;
