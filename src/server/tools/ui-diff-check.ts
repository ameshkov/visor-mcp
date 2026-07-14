import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runDualImageAnalysis,
  nonWhitespaceField,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';

const uiDiffSchema = z.object({
  expected_image_source: nonWhitespaceField(
    'Expected/reference UI design image: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  actual_image_source: nonWhitespaceField(
    'Actual/current implementation image: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField(
    'Instructions for the comparison. Specify which aspects to focus on and what level of detail is needed.',
  ),
});

const UI_DIFF_CHECK_DESCRIPTION = `Compare an expected/reference UI screenshot with an actual implementation to identify visual and implementation discrepancies for design-to-build verification.

Use this tool ONLY when the user wants to compare an expected/reference UI with an actual implementation.

Do NOT use for: general image comparison, error diagnosis, or analyzing a single UI.`;

/**
 * System prompt for the `ui_diff_check` tool.
 */
export const UI_DIFF_CHECK_PROMPT = `# UI Difference Check

You are a senior frontend QA engineer specializing in visual regression.

Compare the first image, which is the expected reference, with the second image,
which is the actual implementation. Begin with overall similarity, then inspect
the interface systematically from top to bottom and by component. Compare
presence, order, position, alignment, dimensions, spacing, layout, colors,
typography, borders, radii, shadows, imagery, icons, controls, states, and text.
Identify missing, extra, clipped, or incorrect elements. Group recurring
symptoms that may share a root cause. Rate user impact and classify each issue
as CRITICAL, HIGH, MEDIUM, or LOW. Estimate measurements and match percentage
only when useful, and label them as estimates rather than facts.

Organize the response as:

1. **Overall Assessment** — similarity summary, estimated match percentage, and
   major difference categories.
2. **Detailed Differences** — for each issue include location, description,
   expected state, actual state, and severity.
3. **Layout Issues** — alignment, sizing, spacing, positioning, and responsive
   discrepancies.
4. **Content Issues** — missing, extra, incorrect, truncated, or mismatched text,
   images, and icons.
5. **Styling Issues** — color, typography, border, radius, shadow, and state
   differences.
6. **Recommended Fixes** — prioritized, implementation-oriented corrections,
   including CSS examples where appropriate.
7. **Testing Notes** — matching areas, acceptable variations, uncertain areas,
   and suggested follow-up checks.
`;

type UiDiffArgs = z.infer<typeof uiDiffSchema>;

function uiDiffHandler(config: ServerConfig) {
  return async (args: UiDiffArgs, extra: ToolHandlerExtra): Promise<CallToolResult> => {
    const userText = `<images>
<image>First image is the EXPECTED/REFERENCE target.</image>
<image>Second image is the ACTUAL/CURRENT implementation.</image>
</images>

${args.prompt}`;
    return runDualImageAnalysis(
      config,
      { expected: args.expected_image_source, actual: args.actual_image_source },
      { systemPrompt: UI_DIFF_CHECK_PROMPT, userText },
      extra.signal,
    );
  };
}

export const uiDiffCheck: Tool = {
  name: 'ui_diff_check',
  description: UI_DIFF_CHECK_DESCRIPTION,
  schema: uiDiffSchema,
  register(server, config) {
    server.registerTool(
      'ui_diff_check',
      { description: UI_DIFF_CHECK_DESCRIPTION, inputSchema: uiDiffSchema },
      uiDiffHandler(config),
    );
  },
};
