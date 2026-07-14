import type { ServerConfig } from '../../config/index.js';
import type { ValidatedImage } from '../images/index.js';
import {
  CANCELLED_MESSAGE,
  isTransientStatus,
  withAttemptTimeout,
  withRetry,
  type AttemptOutcome,
} from '../../utils/index.js';

interface ProviderRequest {
  readonly systemPrompt: string;
  readonly userText: string;
  readonly images: readonly ValidatedImage[];
}

type ProviderResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Send the Chat Completions request with the retry and per-attempt timeout
 * policy. Transient failures (connection, per-attempt timeout,
 * HTTP 408/429/5xx) are retried up to twice after 1s and 2s; permanent
 * failures (other 4xx, malformed provider responses) return without
 * retrying. If `signal` is aborted, the retry loop short-circuits and
 * returns a `Request cancelled` result without dispatching another attempt.
 * Returns one sanitized `ProviderResult`.
 */
export function analyze(
  config: ServerConfig,
  request: ProviderRequest,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  return runAnalyze(config, request, signal);
}

async function runAnalyze(
  config: ServerConfig,
  request: ProviderRequest,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const outcome = await withRetry(() => attemptProviderRequest(config, request, signal), signal);
  return outcome.ok ? { ok: true, text: outcome.value } : { ok: false, error: outcome.message };
}

async function attemptProviderRequest(
  config: ServerConfig,
  request: ProviderRequest,
  signal?: AbortSignal,
): Promise<AttemptOutcome<string>> {
  return withAttemptTimeout(
    config.requestTimeoutMs,
    async (composedSignal) => {
      let response: Response;
      try {
        response = await fetch(config.chatCompletionsEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(composeRequestBody(config, request)),
          signal: composedSignal,
        });
      } catch {
        // If the caller cancelled the MCP request, do NOT retry:
        // short-circuit to a permanent `Request cancelled` outcome.
        // Otherwise the abort is from the per-attempt timeout (or a
        // connection failure), which IS retriable.
        if (signal?.aborted) {
          return { ok: false, retriable: false, message: CANCELLED_MESSAGE };
        }
        return { ok: false, retriable: true, message: 'provider request failed' };
      }
      if (!response.ok) {
        const retriable = isTransientStatus(response.status);
        return { ok: false, retriable, message: 'provider request failed' };
      }
      // The provider may return 2xx with a non-JSON body, or stall mid-body
      // after sending headers. See `readResponseBody` for the three
      // outcome cases (caller abort, per-attempt timeout, malformed body).
      return readResponseBody(response, signal, composedSignal);
    },
    signal,
  );
}

/**
 * Read and normalize a 2xx provider body, handling mid-body aborts.
 *
 * The provider may return 2xx with a non-JSON body (e.g. a misconfigured
 * proxy/gateway HTML page or a truncated response). `response.json()`
 * throws a SyntaxError in that case; catch it so the attempt stays total
 * and the raw provider body never leaks.
 *
 * The composed fetch signal can also abort the body stream while
 * `response.json()` is reading: either the caller cancelled (external
 * `signal` aborted mid-body) or the per-attempt timeout fired
 * (`composedSignal` aborted but the caller is still active). Mirror the
 * fetch catch in {@link attemptProviderRequest}:
 * - Caller abort → permanent `Request cancelled` so the user sees the
 *   cancellation, not a misleading `malformed provider response`.
 * - Per-attempt timeout → retriable `provider request failed`. This is
 *   the "hung provider returns headers then stalls mid-body" case,
 *   which must honor the same retry policy as a timeout on the fetch
 *   itself.
 * - Otherwise → permanent `malformed provider response` for a genuinely
 *   non-JSON or truncated 2xx body (no retry).
 */
async function readResponseBody(
  response: Response,
  signal: AbortSignal | undefined,
  composedSignal: AbortSignal,
): Promise<AttemptOutcome<string>> {
  try {
    const normalized = normalizeResponse(await response.json());
    return normalized.ok
      ? { ok: true, value: normalized.text }
      : { ok: false, retriable: false, message: 'malformed provider response' };
  } catch {
    if (signal?.aborted) {
      return { ok: false, retriable: false, message: CANCELLED_MESSAGE };
    }
    if (composedSignal.aborted) {
      return { ok: false, retriable: true, message: 'provider request failed' };
    }
    return {
      ok: false,
      retriable: false,
      message: 'malformed provider response',
    };
  }
}

function composeRequestBody(
  config: ServerConfig,
  request: ProviderRequest,
): Record<string, unknown> {
  const imageParts = request.images.map((image) => ({
    type: 'image_url',
    image_url: { url: image.dataUrl },
  }));
  return {
    ...config.requestBodyExtras,
    model: config.model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      {
        role: 'user',
        content: [...imageParts, { type: 'text', text: request.userText }],
      },
    ],
    stream: false,
  };
}

function normalizeResponse(json: unknown): ProviderResult {
  const text = firstChoiceText(json);
  if (text === null) {
    return { ok: false, error: 'malformed provider response' };
  }
  return { ok: true, text };
}

function firstChoiceText(json: unknown): string | null {
  if (!isObject(json)) return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown> | undefined)?.message;
  if (!isObject(message)) return null;
  const content = message.content;
  if (typeof content === 'string') return content.length > 0 ? content : null;
  if (Array.isArray(content)) {
    const texts = content
      .filter(isTextPart)
      .map((part) => (part as Record<string, unknown>).text as string);
    return texts.length > 0 ? texts.join('') : null;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTextPart(part: unknown): boolean {
  return isObject(part) && part.type === 'text' && typeof part.text === 'string';
}
