import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../config/index.js';
import { errorToolResult, notImplementedToolResult } from '../config/index.js';
import { analyze, getSystemPrompt, loadImage, type ValidatedImage } from '../services/index.js';

const nonWhitespace = z
  .string()
  .refine((v) => v.trim().length > 0, 'must not be empty or whitespace-only');

const imageSource = nonWhitespace;
const outputTypeEnum = z.enum(['code', 'prompt', 'spec', 'description']);

const uiToArtifactSchema = z
  .object({ image_source: imageSource, output_type: outputTypeEnum, prompt: nonWhitespace })
  .strict();

const extractTextSchema = z
  .object({
    image_source: imageSource,
    prompt: nonWhitespace,
    programming_language: nonWhitespace.optional(),
  })
  .strict();

const diagnoseErrorSchema = z
  .object({ image_source: imageSource, prompt: nonWhitespace, context: nonWhitespace.optional() })
  .strict();

const understandDiagramSchema = z
  .object({
    image_source: imageSource,
    prompt: nonWhitespace,
    diagram_type: nonWhitespace.optional(),
  })
  .strict();

const analyzeVisualizationSchema = z
  .object({
    image_source: imageSource,
    prompt: nonWhitespace,
    analysis_focus: nonWhitespace.optional(),
  })
  .strict();

const uiDiffSchema = z
  .object({
    expected_image_source: imageSource,
    actual_image_source: imageSource,
    prompt: nonWhitespace,
  })
  .strict();

const analyzeImageSchema = z.object({ image_source: imageSource, prompt: nonWhitespace }).strict();

const ANALYZE_IMAGE_DESCRIPTION =
  'General-purpose image analysis for requests that do not fit any specialized tool. It is the fallback rather than an alternative name for a specialized workflow.';

// Not exported: referenced only within this module as the element type of
// `TOOL_DEFINITIONS`, so exporting it would trip Knip. Tests use the values
// structurally.
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodTypeAny;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'ui_to_artifact',
    description:
      'Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description. Use it for UI design conversion, not OCR, error diagnosis, technical diagrams, or charts.',
    schema: uiToArtifactSchema,
  },
  {
    name: 'extract_text_from_screenshot',
    description:
      'Extract text from screenshots containing source code, terminal output, configuration, documentation, or general prose. Use it for OCR rather than UI conversion, diagnosis, or diagram interpretation.',
    schema: extractTextSchema,
  },
  {
    name: 'diagnose_error_screenshot',
    description:
      'Analyze a screenshot containing an error, exception, or stack trace and provide diagnosis and corrective action. Use it for error analysis, not generic OCR, UI conversion, or diagram understanding.',
    schema: diagnoseErrorSchema,
  },
  {
    name: 'understand_technical_diagram',
    description:
      'Explain architecture diagrams, flowcharts, UML, entity relationship diagrams, sequence diagrams, and other technical visualizations. Use it for technical structure and flow, not UI screenshots, errors, or data charts.',
    schema: understandDiagramSchema,
  },
  {
    name: 'analyze_data_visualization',
    description:
      'Analyze charts, graphs, and dashboards to extract metrics, patterns, anomalies, and actionable insights. Use it for visualized data rather than UI mockups, errors, or architecture diagrams.',
    schema: analyzeVisualizationSchema,
  },
  {
    name: 'ui_diff_check',
    description:
      'Compare an expected UI screenshot with an actual implementation to identify visual and implementation discrepancies. Use it for design-to-build verification, not unordered image comparison or single-image analysis.',
    schema: uiDiffSchema,
  },
  {
    name: 'analyze_image',
    description: ANALYZE_IMAGE_DESCRIPTION,
    schema: analyzeImageSchema,
  },
];

export function registerTools(server: McpServer, config: ServerConfig): void {
  for (const def of TOOL_DEFINITIONS) {
    if (def.name === 'analyze_image') continue;
    server.registerTool(def.name, { description: def.description, inputSchema: def.schema }, () =>
      notImplementedToolResult(def.name),
    );
  }
  server.registerTool(
    'analyze_image',
    { description: ANALYZE_IMAGE_DESCRIPTION, inputSchema: analyzeImageSchema },
    analyzeImageHandler(config),
  );
}

function analyzeImageHandler(config: ServerConfig) {
  return async (args: z.infer<typeof analyzeImageSchema>): Promise<CallToolResult> => {
    let image: ValidatedImage;
    try {
      image = await loadImage(args.image_source, config.maxImageSizeMb);
    } catch (error) {
      return errorToolResult(toSafeMessage(error));
    }
    // `analyze` is total by construction — Task 4's doRequest wraps the
    // response.json() + normalizeResponse chain in try/catch and every
    // fetch/non-2xx failure returns a ProviderResult — so this await cannot
    // throw a SyntaxError (or any other provider exception) into the MCP SDK;
    // the !ok branch maps the sanitized error string to an `Error:` result.
    const result = await analyze(config, {
      systemPrompt: getSystemPrompt('analyze_image'),
      userText: args.prompt,
      images: [image],
    });
    return result.ok
      ? { content: [{ type: 'text' as const, text: result.text }] }
      : errorToolResult(result.error);
  };
}

function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'image source is invalid';
}
