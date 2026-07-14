import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runImageAnalysis,
  nonWhitespaceField,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';

const extractTextSchema = z.object({
  image_source: nonWhitespaceField(
    'Screenshot to extract text from: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField(
    'Instructions for text extraction. Specify what kind of text to extract and any formatting requirements.',
  ),
  programming_language: nonWhitespaceField(
    "Optional: programming-language hint when the screenshot contains code (e.g. 'python', 'javascript', 'java'). Improves code recognition; omit for non-code text.",
  ).optional(),
});

const EXTRACT_TEXT_DESCRIPTION = `Extract and recognize text from screenshots using OCR, optimized for source code, terminal output, configuration, documentation, and general prose.

Use this tool ONLY when the user has a screenshot containing text and wants that text extracted. It preserves code formatting and honors an optional programming-language hint.

Do NOT use for: UI design conversion, error diagnosis, or diagram understanding.`;

/**
 * System prompt for the `extract_text_from_screenshot` tool.
 */
export const EXTRACT_TEXT_FROM_SCREENSHOT_PROMPT = `# Extract Text from Screenshot

You are a text-extraction specialist experienced with OCR, source code,
terminals, configuration files, and documents.

Transcribe all relevant visible text with maximum accuracy while preserving its
meaningful structure. For code, retain indentation, punctuation, operators,
quotes, and bracket matching. For terminals, preserve prompts, timestamps, log
levels, ordering, and alignment. For structured formats such as JSON, YAML, XML,
and environment files, preserve hierarchy and syntax. For prose, retain
headings, lists, emphasis, and reading order. Resolve commonly confused glyphs
only when context supports the correction. Never invent obscured or illegible
content; mark uncertainty explicitly. Handle columns according to their logical
reading order and perform a final consistency check.

Organize the response as:

1. **Extracted Text** — verbatim text in appropriately identified code blocks,
   preserving significant whitespace.
2. **Content Type** — a specific classification of the captured material.
3. **Language or Format** — detected programming language, markup, data format,
   or prose type.
4. **OCR Corrections** — context-supported corrections made during
   transcription.
5. **Quality Notes** — uncertainty, clipping, blur, unreadable regions, or other
   limitations.

The transcription should be suitable for direct use whenever image quality
allows it.
`;

type ExtractTextArgs = z.infer<typeof extractTextSchema>;

function extractTextHandler(config: ServerConfig) {
  return async (args: ExtractTextArgs, extra: ToolHandlerExtra): Promise<CallToolResult> => {
    const userText = args.programming_language
      ? `${args.prompt}\n\n<language_hint>The code is in ${args.programming_language}.</language_hint>`
      : args.prompt;
    return runImageAnalysis(
      config,
      args.image_source,
      {
        systemPrompt: EXTRACT_TEXT_FROM_SCREENSHOT_PROMPT,
        userText,
      },
      extra.signal,
    );
  };
}

export const extractTextFromScreenshot: Tool = {
  name: 'extract_text_from_screenshot',
  description: EXTRACT_TEXT_DESCRIPTION,
  schema: extractTextSchema,
  register(server, config) {
    server.registerTool(
      'extract_text_from_screenshot',
      { description: EXTRACT_TEXT_DESCRIPTION, inputSchema: extractTextSchema },
      extractTextHandler(config),
    );
  },
};
