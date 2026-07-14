import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runImageAnalysis,
  nonWhitespaceField,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';

const analyzeImageSchema = z.object({
  image_source: nonWhitespaceField(
    'Image to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField(
    'What to analyze, extract, or understand from the image. Be specific about your requirements.',
  ),
});

const ANALYZE_IMAGE_DESCRIPTION = `General-purpose image analysis for scenarios not covered by a specialized tool.

Use this tool as a FALLBACK when none of the specialized tools (ui_to_artifact, extract_text_from_screenshot, diagnose_error_screenshot, understand_technical_diagram, analyze_data_visualization, ui_diff_check) fit the user's need.

Do NOT use for: tasks that match one of the specialized tools above.`;

/**
 * @internal Exported for tests only; not part of the public module API.
 *
 * System prompt for the `analyze_image` tool.
 */
export const ANALYZE_IMAGE_PROMPT = `# Analyze Image

You are an adaptable vision assistant for image-analysis requests that do not
fit a more specialized tool.

Analyze the supplied image according to the user's instructions. Examine the
whole image and all relevant objects, people, text, symbols, backgrounds,
composition, and relationships before focusing on the requested subject.
Determine the image's likely context and purpose when that helps. Match the
depth and organization of the answer to the user's need, whether identification,
description, comparison, extraction, aesthetic analysis, or interpretation.
State only what the image supports, distinguish observations from inferences,
and identify ambiguity rather than fabricating detail. Explain why observations
matter instead of merely listing them.

Use a flexible response structure, including these sections when they improve
the answer:

1. **Main Response** — the direct answer to the user's request.
2. **Detailed Observations** — supporting evidence grouped by location,
   category, or importance.
3. **Context and Analysis** — interpretation, patterns, or conclusions beyond
   direct description.
4. **Additional Notes** — relevant limitations, image-quality issues, or useful
   observations not directly requested.

Do not force sections that do not help answer the user's specific request.
`;

type AnalyzeImageArgs = z.infer<typeof analyzeImageSchema>;

function analyzeImageHandler(config: ServerConfig) {
  return async (args: AnalyzeImageArgs, extra: ToolHandlerExtra): Promise<CallToolResult> =>
    runImageAnalysis(
      config,
      args.image_source,
      {
        systemPrompt: ANALYZE_IMAGE_PROMPT,
        userText: args.prompt,
      },
      extra.signal,
    );
}

export const analyzeImage: Tool = {
  name: 'analyze_image',
  description: ANALYZE_IMAGE_DESCRIPTION,
  schema: analyzeImageSchema,
  register(server, config) {
    server.registerTool(
      'analyze_image',
      { description: ANALYZE_IMAGE_DESCRIPTION, inputSchema: analyzeImageSchema },
      analyzeImageHandler(config),
    );
  },
};
