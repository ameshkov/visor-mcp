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
 * The subset of the MCP SDK's `RequestHandlerExtra` that tool handlers
 * consume: just the per-call cancellation `signal`. Defining a narrow
 * structural type keeps SDK imports localized; the SDK's richer `extra`
 * object is still assignable to this type by standard TypeScript
 * parameter contravariance, so a callback accepting `ToolHandlerExtra`
 * is assignable to the SDK-expected `ToolCallback<Args>`.
 */
export interface ToolHandlerExtra {
  readonly signal: AbortSignal;
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
 * provider. The `analyze` service is total by construction —
 * `attemptProviderRequest` wraps the `response.json()` +
 * `normalizeResponse` chain in try/catch and every fetch/non-2xx failure
 * returns a `ProviderResult` — so this cannot throw a `SyntaxError` (or
 * any other provider exception) into the MCP SDK; the `!ok` branch maps
 * the sanitized error string to an `Error:` result.
 *
 * @param signal If supplied, aborts the image load and provider request
 *   when the MCP call is cancelled. Omit for backward compatibility.
 * @returns A `CallToolResult` — one text content item on success, or an
 * `Error:` result on failure.
 */
export async function runImageAnalysis(
  config: ServerConfig,
  imageSource: string,
  request: ImageAnalysisRequest,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  let image: ValidatedImage;
  try {
    image = await loadImage(imageSource, config.maxImageSizeMb, config.requestTimeoutMs, signal);
  } catch (error) {
    return errorToolResult(toSafeMessage(error));
  }
  const result = await analyze(
    config,
    {
      systemPrompt: request.systemPrompt,
      userText: request.userText,
      images: [image],
    },
    signal,
  );
  return result.ok
    ? { content: [{ type: 'text' as const, text: result.text }] }
    : errorToolResult(result.error);
}

/**
 * Loads two image sources concurrently and runs them through the vision
 * provider in fixed expected-then-actual order, mapping the result to a
 * `CallToolResult`.
 *
 * Atomic validation: both sources are resolved and byte-validated before
 * the provider is contacted (see {@link loadBothImages}). If either source
 * is invalid, an `Error:` result is returned and the provider receives
 * neither image; the in-flight peer load is aborted so an invalid expected
 * source does not strand a pending actual download (and vice versa). The
 * `analyze` service is total by construction — `attemptProviderRequest`
 * wraps the `response.json()` + `normalizeResponse` chain in try/catch and
 * every fetch/non-2xx failure returns a `ProviderResult` — so this cannot
 * throw into the MCP SDK.
 *
 * @param signal If supplied, aborts both image loads and the provider
 *   request when the MCP call is cancelled. Omit for backward compatibility.
 * @returns A `CallToolResult` — one text content item on success, or an
 * `Error:` result on failure.
 */
export async function runDualImageAnalysis(
  config: ServerConfig,
  sources: { readonly expected: string; readonly actual: string },
  request: ImageAnalysisRequest,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  const loaded = await loadBothImages(config, sources, signal);
  if (!loaded.ok) return errorToolResult(loaded.error);
  const result = await analyze(
    config,
    {
      systemPrompt: request.systemPrompt,
      userText: request.userText,
      images: [loaded.expected, loaded.actual],
    },
    signal,
  );
  return result.ok
    ? { content: [{ type: 'text' as const, text: result.text }] }
    : errorToolResult(result.error);
}

/**
 * Loads the expected and actual image sources concurrently. A local
 * `AbortController` propagates an external cancel to both loads AND cancels
 * the in-flight peer when one load fails, so an invalid expected source does
 * not strand a pending actual download. The external `signal` itself is
 * never aborted on a validation failure — only the local controller is — so
 * the first rejection's message reaches the caller unaltered via
 * {@link toSafeMessage}.
 */
async function loadBothImages(
  config: ServerConfig,
  sources: { readonly expected: string; readonly actual: string },
  signal?: AbortSignal,
): Promise<
  | { readonly ok: true; readonly expected: ValidatedImage; readonly actual: ValidatedImage }
  | { readonly ok: false; readonly error: string }
> {
  const local = new AbortController();
  const onExternalAbort = (): void => local.abort();
  if (signal) {
    if (signal.aborted) {
      local.abort();
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  // Abort the peer on rejection so the surviving in-flight load is
  // cancelled; re-throw so Promise.all rejects with the first failure.
  // When the first load rejects, `cancelPeer` aborts `local`, which
  // rejects the peer fetch.  The `.catch(cancelPeer)` on the already-
  // rejected peer is a no-op — re-throwing an already-rejected promise
  // does not settle it a second time — so the first rejection message
  // survives unaltered and becomes the `error` in the Promise.all catch.
  const cancelPeer = (reason: unknown): never => {
    local.abort();
    throw reason;
  };
  try {
    const [expected, actual] = await Promise.all([
      loadImage(
        sources.expected,
        config.maxImageSizeMb,
        config.requestTimeoutMs,
        local.signal,
      ).catch(cancelPeer),
      loadImage(sources.actual, config.maxImageSizeMb, config.requestTimeoutMs, local.signal).catch(
        cancelPeer,
      ),
    ]);
    return { ok: true, expected, actual };
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) };
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
