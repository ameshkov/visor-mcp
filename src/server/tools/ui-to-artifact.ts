import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runImageAnalysis,
  nonWhitespaceField,
  outputTypeEnum,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';
import { getUiToArtifactPrompt } from './ui-to-artifact-prompts.js';

const uiToArtifactSchema = z.object({
  image_source: nonWhitespaceField(
    'UI screenshot to convert: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  output_type: outputTypeEnum.describe(
    "Type of artifact to generate. Options: 'code' (frontend code), 'prompt' (AI prompt to recreate the UI), 'spec' (design specification document), 'description' (natural-language description of the UI).",
  ),
  prompt: nonWhitespaceField(
    'Detailed instructions for the conversion. State the desired output and any specific requirements.',
  ),
});

const UI_TO_ARTIFACT_DESCRIPTION = `Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description, selected via output_type.

Use this tool ONLY when the user wants to:
- Generate frontend code from a UI design (output_type='code')
- Create an AI prompt that recreates the UI (output_type='prompt')
- Extract a design specification document (output_type='spec')
- Get a natural-language description of the UI (output_type='description')

Do NOT use for: OCR/text extraction, error diagnosis, technical diagrams, or data visualizations.`;

type UiToArtifactArgs = z.infer<typeof uiToArtifactSchema>;

function uiToArtifactHandler(config: ServerConfig) {
  return async (args: UiToArtifactArgs, extra: ToolHandlerExtra): Promise<CallToolResult> =>
    runImageAnalysis(
      config,
      args.image_source,
      {
        systemPrompt: getUiToArtifactPrompt(args.output_type),
        userText: args.prompt,
      },
      extra.signal,
    );
}

export const uiToArtifact: Tool = {
  name: 'ui_to_artifact',
  description: UI_TO_ARTIFACT_DESCRIPTION,
  schema: uiToArtifactSchema,
  register(server, config) {
    server.registerTool(
      'ui_to_artifact',
      { description: UI_TO_ARTIFACT_DESCRIPTION, inputSchema: uiToArtifactSchema },
      uiToArtifactHandler(config),
    );
  },
};
