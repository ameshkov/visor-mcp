/**
 * Shared retry primitives used by the provider and image-download services.
 *
 * Policy: at most {@link MAX_ATTEMPTS} attempts, with backoff delays of 1s
 * then 2s between attempts, applied only to transient failures. The public
 * symbols (`withRetry`, `withAttemptTimeout`, `isTransientStatus`,
 * `AttemptOutcome`) are re-exported by `utils/index.ts`; `MAX_ATTEMPTS` and
 * `RETRY_DELAYS_MS` are not part of the public surface (consumed internally
 * by `withRetry` and by the colocated test).
 */

/**
 * Maximum attempts (3 total: 1 initial + 2 retries).
 *
 * @internal Exported for tests only; not part of the public module API.
 */
export const MAX_ATTEMPTS = 3;

/**
 * Backoff delays between retry attempts, in milliseconds. Index 0 is the
 * delay before attempt 2; index 1 is the delay before attempt 3.
 *
 * @internal Exported for tests only; not part of the public module API.
 */
export const RETRY_DELAYS_MS = [1_000, 2_000] as const;

/**
 * Curated message emitted for every cancellation outcome — when the caller
 * aborts the MCP request, when the signal is already aborted at entry, or
 * when the signal aborts during a backoff sleep. Single source of truth so
 * the message cannot drift across the retry driver, the image loader, and
 * the provider; re-exported by `utils/index.ts`.
 */
export const CANCELLED_MESSAGE = 'Request cancelled';

/**
 * Outcome of a single retryable attempt. The driver returns the last
 * outcome to its caller, so the success or failure shape propagates
 * unmodified to the consuming service.
 */
export type AttemptOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string; readonly retriable: boolean };

/**
 * Resolve after `ms` using `setTimeout` (fake-timer friendly). If `signal`
 * aborts before the timer fires, resolves immediately without waiting.
 *
 * NOT exported — internal to the retry driver.
 */
async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Run `attempt` up to {@link MAX_ATTEMPTS} times. Retries only when the
 * latest outcome is `retriable: true` and attempts remain; sleeps
 * {@link RETRY_DELAYS_MS}[attemptIndex] between attempts. If `signal`
 * aborts before an attempt or during a backoff sleep, returns a permanent
 * `Request cancelled` outcome without scheduling another attempt.
 */
export async function withRetry<T>(
  attempt: () => Promise<AttemptOutcome<T>>,
  signal?: AbortSignal,
): Promise<AttemptOutcome<T>> {
  let outcome: AttemptOutcome<T> | undefined;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (signal?.aborted) {
      return { ok: false, retriable: false, message: CANCELLED_MESSAGE };
    }
    outcome = await attempt();
    if (outcome.ok || !outcome.retriable) return outcome;
    if (signal?.aborted) {
      return { ok: false, retriable: false, message: CANCELLED_MESSAGE };
    }
    const isLast = i === MAX_ATTEMPTS - 1;
    if (isLast) return outcome;
    await delay(RETRY_DELAYS_MS[i], signal);
  }
  return outcome!;
}

/**
 * Wraps `run` with an `AbortController` whose signal aborts after
 * `timeoutMs`, OR as soon as `externalSignal` (if supplied) aborts —
 * whichever happens first. The pending timer is cleared and the external
 * listener is removed in a `finally` so successful attempts or external
 * aborts do not leave a stray pending timer or a leaked listener (important
 * under fake timers and across the retry loop).
 */
export async function withAttemptTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Whether an HTTP status code represents a transient retryable failure
 * (HTTP 408, 429, or any 5xx). Shared by the provider and HTTP image loader
 * so the retriable status set cannot drift between the two paths.
 */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
