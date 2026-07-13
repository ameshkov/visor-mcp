import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { errorToolResult, type ServerConfig } from '../../config/index.js';
import { analyze, loadImage, type ValidatedImage } from '../../services/index.js';

/**
 * Build a non-empty, non-whitespace string field whose `description` is
 * emitted into the tool's JSON Schema so clients receive parameter guidance
 * via `tools/list`.
 *
 * A fresh schema instance is produced on every call: each field therefore
 * emits its own `{ type: 'string', description }` property (no cross-field
 * `$ref` deduplication) while sharing the same whitespace validation.
 */
export function nonWhitespaceField(description: string): z.ZodTypeAny {
  return z
    .string()
    .refine((v) => v.trim().length > 0, 'must not be empty or whitespace-only')
    .describe(description);
}

/**
 * Allowed `output_type` values for `ui_to_artifact`.
 */
export const outputTypeEnum = z.enum(['code', 'prompt', 'spec', 'description']);

/**
 * The contract every tool implements. Each tool owns a stable `name`, a
 * human-readable `description`, a validated `schema`, and a `register` hook
 * that wires the tool onto an `McpServer` bound to the given configuration.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodTypeAny;
  readonly register: (server: McpServer, config: ServerConfig) => void;
}

/**
 * Normalizes a thrown value into a safe user-facing message, defaulting
 * when the value is not an `Error` instance.
 */
function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'image source is invalid';
}

/** Request payload for {@link runImageAnalysis}. */
interface ImageAnalysisRequest {
  readonly systemPrompt: string;
  readonly userText: string;
}

/**
 * Loads the image at `imageSource`, runs it through the vision provider, and
 * maps the result to a `CallToolResult`.
 *
 * Image-load failures return an `Error:` result without reaching the
 * provider. The `analyze` service is total by construction — `doRequest`
 * wraps the `response.json()` + `normalizeResponse` chain in try/catch and
 * every fetch/non-2xx failure returns a `ProviderResult` — so this cannot
 * throw a `SyntaxError` (or any other provider exception) into the MCP SDK;
 * the `!ok` branch maps the sanitized error string to an `Error:` result.
 *
 * @returns A `CallToolResult` — one text content item on success, or an
 * `Error:` result on failure.
 */
export async function runImageAnalysis(
  config: ServerConfig,
  imageSource: string,
  request: ImageAnalysisRequest,
): Promise<CallToolResult> {
  let image: ValidatedImage;
  try {
    image = await loadImage(imageSource, config.maxImageSizeMb);
  } catch (error) {
    return errorToolResult(toSafeMessage(error));
  }
  const result = await analyze(config, {
    systemPrompt: request.systemPrompt,
    userText: request.userText,
    images: [image],
  });
  return result.ok
    ? { content: [{ type: 'text' as const, text: result.text }] }
    : errorToolResult(result.error);
}
