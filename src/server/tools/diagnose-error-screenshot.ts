import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runImageAnalysis,
  nonWhitespaceField,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';

const diagnoseErrorSchema = z.object({
  image_source: nonWhitespaceField(
    'Error screenshot to diagnose: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField(
    'What you want to know about this error and what help you need; include relevant context about when it occurred.',
  ),
  context: nonWhitespaceField(
    "Optional: context about when the error occurred (e.g. 'during npm install', 'when running the app', 'after deployment'). Improves diagnosis accuracy.",
  ).optional(),
});

const DIAGNOSE_ERROR_DESCRIPTION = `Diagnose and analyze error messages, stack traces, and exception screenshots: identify the likely root cause and suggest corrective and preventive action.

Use this tool ONLY when the user has an error screenshot and needs help understanding or fixing it.

Do NOT use for: code/UI extraction, general image analysis, or diagram understanding.`;

/**
 * System prompt for the `diagnose_error_screenshot` tool.
 */
export const DIAGNOSE_ERROR_SCREENSHOT_PROMPT = `# Diagnose Error Screenshot

You are an experienced software engineer and debugger.

Inspect the error screenshot, extract all useful evidence, identify the most
likely root cause, and give actionable remediation. Capture the exact error
class, message, relevant file and line information, stack frames, commands,
warnings, and visible code. Infer the language, framework, runtime, and
environment only from supported clues. Trace the stack rather than assuming the
immediate failure location is the underlying cause. Consider common causes,
cascading errors, dependency and configuration issues, version differences, and
environmental factors. Offer an immediate remedy and a robust long-term fix,
with alternatives and trade-offs where relevant. Do not overstate certainty
when evidence is incomplete.

Organize the response as:

1. **Error Summary** — plain-language failure, location, and severity.
2. **Root Cause Analysis** — underlying cause, evidence, contributing factors,
   and related issues.
3. **Solution** — prioritized steps and concrete examples, beginning with the
   fastest safe fix and then the durable approach.
4. **Prevention** — validation, testing, typing, monitoring, documentation, or
   error-handling practices that reduce recurrence.
5. **Additional Notes** — security, data, deployment, or other concerns visible
   in the screenshot.
`;

type DiagnoseErrorArgs = z.infer<typeof diagnoseErrorSchema>;

function diagnoseErrorHandler(config: ServerConfig) {
  return async (args: DiagnoseErrorArgs, extra: ToolHandlerExtra): Promise<CallToolResult> => {
    const userText = args.context
      ? `${args.prompt}\n\n<error_context>This error occurred ${args.context}.</error_context>`
      : args.prompt;
    return runImageAnalysis(
      config,
      args.image_source,
      {
        systemPrompt: DIAGNOSE_ERROR_SCREENSHOT_PROMPT,
        userText,
      },
      extra.signal,
    );
  };
}

export const diagnoseErrorScreenshot: Tool = {
  name: 'diagnose_error_screenshot',
  description: DIAGNOSE_ERROR_DESCRIPTION,
  schema: diagnoseErrorSchema,
  register(server, config) {
    server.registerTool(
      'diagnose_error_screenshot',
      { description: DIAGNOSE_ERROR_DESCRIPTION, inputSchema: diagnoseErrorSchema },
      diagnoseErrorHandler(config),
    );
  },
};
