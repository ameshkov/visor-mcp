import { expectNotImplemented, pngDataUrl } from '../src/fixtures.js';
import type { ToolFixture } from '../src/types.js';

/**
 * `understand_technical_diagram` is reserved for future work. The
 * fixture uses a flowchart PNG (start oval, process rectangle, decision
 * diamond, end oval, connected by arrows) so the arguments reflect the
 * tool's diagram-understanding purpose. The handler must reject calls
 * with a sanitized not-implemented error.
 */
export default {
  tool: 'understand_technical_diagram',
  cases: [
    {
      name: 'reports not implemented',
      description:
        'A valid call with a flowchart image returns a sanitized not-implemented error and never reaches the provider.',
      arguments: {
        image_source: pngDataUrl('flowchart.png'),
        prompt: 'explain this flowchart step by step',
        diagram_type: 'flowchart',
      },
      assert({ result, toolName }) {
        expectNotImplemented(result, toolName);
      },
    },
  ],
} satisfies ToolFixture;
