import { z } from 'zod';
import { notImplementedToolResult } from '../../config/index.js';
import { nonWhitespaceField, type Tool } from './common.js';

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

export const uiDiffCheck: Tool = {
  name: 'ui_diff_check',
  description: UI_DIFF_CHECK_DESCRIPTION,
  schema: uiDiffSchema,
  register(server) {
    server.registerTool(
      'ui_diff_check',
      { description: UI_DIFF_CHECK_DESCRIPTION, inputSchema: uiDiffSchema },
      () => notImplementedToolResult('ui_diff_check'),
    );
  },
};
