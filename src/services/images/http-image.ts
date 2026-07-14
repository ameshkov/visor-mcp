import { Buffer } from 'node:buffer';
import { assertDeclaredImageMimeMatches, contentTypeToImageMime, detectFormat } from './format.js';
import {
  CANCELLED_MESSAGE,
  isTransientStatus,
  withAttemptTimeout,
  withRetry,
  type AttemptOutcome,
} from '../../utils/index.js';
import type { ValidatedImage } from './images.js';

const MAX_REDIRECTS = 5;

/** Loads, redirects, bounds, byte-validates, and MIME-matches an HTTP image. */
export async function loadHttpImage(
  rawUrl: string,
  maxBytes: number,
  requestTimeoutMs: number,
  signal?: AbortSignal,
): Promise<ValidatedImage> {
  const outcome = await withRetry(
    () => attemptHttpDownload(rawUrl, maxBytes, requestTimeoutMs, signal),
    signal,
  );
  if (outcome.ok) return outcome.value;
  throw new Error(outcome.message);
}

async function attemptHttpDownload(
  rawUrl: string,
  maxBytes: number,
  requestTimeoutMs: number,
  signal?: AbortSignal,
): Promise<AttemptOutcome<ValidatedImage>> {
  return withAttemptTimeout(
    requestTimeoutMs,
    async (composedSignal) => {
      let current = rawUrl;
      let redirects = 0;
      for (;;) {
        let response: Response;
        try {
          response = await fetchHttpResponse(current, composedSignal);
        } catch {
          if (signal?.aborted) {
            return {
              ok: false,
              retriable: false,
              message: CANCELLED_MESSAGE,
            };
          }
          // Connection failure, DNS, TLS, or per-attempt timeout abort.
          return {
            ok: false,
            retriable: true,
            message: 'image download failed',
          };
        }
        if (isRedirectStatus(response.status)) {
          const step = await handleRedirect(response, current, redirects);
          if ('outcome' in step) return step.outcome;
          current = step.next;
          redirects = step.redirects;
          continue;
        }
        return readAndValidateDownload(response, maxBytes);
      }
    },
    signal,
  );
}

type RedirectStep =
  | { readonly outcome: AttemptOutcome<ValidatedImage> }
  | { readonly next: string; readonly redirects: number };

/**
 * Process a single HTTP redirect response. Consumes the response body,
 * validates the `Location` header, resolves it relative to the current
 * URL, and checks the resulting scheme is still `http:` or `https:`.
 *
 * Returns a {@link RedirectStep} discriminated union:
 * - `{ outcome }` when the redirect is invalid (exceeded limit, missing or
 *   unresolvable location, unsupported scheme) — the caller returns the
 *   outcome directly without following.
 * - `{ next, redirects }` when the redirect is valid — the caller updates
 *   its current URL and increment counter and continues the redirect loop.
 */
async function handleRedirect(
  response: Response,
  current: string,
  redirects: number,
): Promise<RedirectStep> {
  await discardBody(response);
  if (redirects >= MAX_REDIRECTS) {
    return {
      outcome: {
        ok: false,
        retriable: false,
        message: 'image download exceeded the redirect limit',
      },
    };
  }
  const location = response.headers.get('location');
  if (!location) {
    return {
      outcome: {
        ok: false,
        retriable: false,
        message: 'image redirect is missing a location',
      },
    };
  }
  let next: string;
  try {
    next = resolveRedirect(current, location);
  } catch {
    return {
      outcome: {
        ok: false,
        retriable: false,
        message: 'image redirect is missing a valid location',
      },
    };
  }
  const schemeErr = httpSchemeError(next);
  if (schemeErr) {
    return { outcome: { ok: false, retriable: false, message: schemeErr } };
  }
  return { next, redirects: redirects + 1 };
}

async function readAndValidateDownload(
  response: Response,
  maxBytes: number,
): Promise<AttemptOutcome<ValidatedImage>> {
  if (!response.ok) {
    const retriable = isTransientStatus(response.status);
    await discardBody(response);
    return { ok: false, retriable, message: 'image download failed' };
  }
  const bytesResult = await readBoundedBody(response, maxBytes);
  if (!bytesResult.ok) return bytesResult;
  const { bytes } = bytesResult.value;
  return validateImageBytes(response, bytes);
}

/**
 * Reads the response body into a bounded `Buffer`, classifying each failure
 * as a permanent validation outcome (`retriable: false` for oversize) or a
 * transient failure (`retriable: true` for a mid-stream read error). Returns
 * an `AttemptOutcome` directly so the caller never inspects a thrown message
 * string — matching the outcome-returning contract used by every other
 * classification site in this module.
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<AttemptOutcome<{ bytes: Buffer }>> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return { ok: true, value: { bytes: Buffer.alloc(0) } };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let emptyStreak = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) {
        // A conforming stream never produces `value: undefined` when
        // `done` is `false`, but guard against a pathological stream that
        // does — break after 5 consecutive empty chunks so the loop
        // cannot spin forever. Surface as a transient failure so the
        // retry policy can recover.
        if (++emptyStreak > 5) {
          await reader.cancel().catch(() => {});
          return { ok: false, retriable: true, message: 'image download failed' };
        }
        continue;
      }
      emptyStreak = 0;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          retriable: false,
          message: 'image exceeds the configured size limit',
        };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, retriable: true, message: 'image download failed' };
  }
  await reader.cancel().catch(() => {});
  return { ok: true, value: { bytes: Buffer.concat(chunks) } };
}

function validateImageBytes(response: Response, bytes: Buffer): AttemptOutcome<ValidatedImage> {
  const mimeType = detectFormat(bytes);
  if (mimeType === null) {
    return {
      ok: false,
      retriable: false,
      message: 'image is not a supported format',
    };
  }
  try {
    assertDeclaredImageMimeMatches(
      contentTypeToImageMime(response.headers.get('content-type')),
      mimeType,
    );
  } catch (error) {
    return {
      ok: false,
      retriable: false,
      message: (error as Error).message,
    };
  }
  return {
    ok: true,
    value: {
      mimeType,
      bytes,
      dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    },
  };
}

async function fetchHttpResponse(url: string, signal: AbortSignal): Promise<Response> {
  return await fetch(stripCredentialsAndFragment(url), {
    method: 'GET',
    redirect: 'manual',
    signal,
  });
}

function stripCredentialsAndFragment(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
}

/**
 * Whether an HTTP status code is a Location-bearing redirect that
 * `redirect: 'manual'` would follow. Limited to the codes HTTP defines as
 * redirects (`fetch` follows the same set) so non-redirect 3xx responses
 * (304 Not Modified, 300 Multiple Choices, etc.) fall through to
 * `readAndValidateDownload` instead of being misrouted into the
 * `Location`-header redirect path.
 */
function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function resolveRedirect(current: string, location: string): string {
  return new URL(location, current).href;
}

/**
 * Returns the curated `image redirect scheme is not supported` message when
 * `url` is not `http:`/`https:`, or `undefined` when it is. Non-throwing so
 * the caller can return the message as an `AttemptOutcome` without a
 * try/catch — the `assert*` prefix is reserved for the throwing siblings
 * in `format.ts`.
 */
function httpSchemeError(url: string): string | undefined {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'image redirect scheme is not supported';
  }
  return undefined;
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}
