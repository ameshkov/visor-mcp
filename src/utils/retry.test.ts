import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withRetry,
  withAttemptTimeout,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  type AttemptOutcome,
} from './retry.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('withRetry', () => {
  it('returns the first success without delay', async () => {
    const attempt = vi.fn(
      async (): Promise<AttemptOutcome<string>> => ({
        ok: true,
        value: 'ok',
      }),
    );
    const result = await withRetry(attempt);
    expect(result).toEqual({ ok: true, value: 'ok' });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries a retriable failure up to MAX_ATTEMPTS then returns the last failure', async () => {
    const attempt = vi.fn(
      async (): Promise<AttemptOutcome<string>> => ({
        ok: false,
        message: 'fail',
        retriable: true,
      }),
    );
    const promise = withRetry(attempt);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
    const result = await promise;
    expect(result).toEqual({ ok: false, message: 'fail', retriable: true });
    expect(attempt).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('does not retry a non-retriable failure', async () => {
    const attempt = vi.fn(
      async (): Promise<AttemptOutcome<string>> => ({
        ok: false,
        message: 'nope',
        retriable: false,
      }),
    );
    const result = await withRetry(attempt);
    expect(result).toEqual({ ok: false, message: 'nope', retriable: false });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('applies RETRY_DELAYS_MS in order (1s then 2s)', async () => {
    // Track the number of attempts fired after each timer advance, rather
    // than using vi.now() (which requires `Date` to be faked). The attempt
    // counter starts at 0, advances to 2 after the first delay, and to 3
    // after the second delay.
    let callCount = 0;
    const attempt = vi.fn(async (): Promise<AttemptOutcome<string>> => {
      callCount++;
      return { ok: false, message: 'fail', retriable: true };
    });
    const promise = withRetry(attempt);
    // Attempt 1 fires synchronously before any timer advance.
    expect(callCount).toBe(1);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    // Attempt 2 fires after RETRY_DELAYS_MS[0].
    expect(callCount).toBe(2);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
    // Attempt 3 fires after RETRY_DELAYS_MS[1].
    expect(callCount).toBe(3);
    await promise;
  });
});

describe('withAttemptTimeout', () => {
  it('aborts the signal after the configured ms', async () => {
    const signals: AbortSignal[] = [];
    const promise = withAttemptTimeout(50, async (signal) => {
      signals.push(signal);
      return new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => resolve('aborted'));
      });
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toBe('aborted');
    expect(signals[0].aborted).toBe(true);
  });

  it('clears the timer when the run resolves before the timeout', async () => {
    // Spy on clearTimeout to verify it is called exactly once.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const promise = withAttemptTimeout(100, async (_signal) => {
      return 'done';
    });
    const result = await promise;
    expect(result).toBe('done');
    // clearTimeout must have been called once (to cancel the pending
    // 100ms timer in the finally block). This verifies the timer does not
    // leak across retry attempts.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});

describe('withRetry cancellation', () => {
  it('returns a cancelled outcome and never calls attempt when the signal is already aborted', async () => {
    const attempt = vi.fn(
      async (): Promise<AttemptOutcome<string>> => ({
        ok: false,
        message: 'fail',
        retriable: true,
      }),
    );
    const controller = new AbortController();
    controller.abort();
    const result = await withRetry(attempt, controller.signal);
    expect(result).toEqual({
      ok: false,
      retriable: false,
      message: 'Request cancelled',
    });
    expect(attempt).not.toHaveBeenCalled();
  });

  it('short-circuits during the backoff delay without scheduling the next attempt', async () => {
    let callCount = 0;
    const attempt = vi.fn(async (): Promise<AttemptOutcome<string>> => {
      callCount++;
      return { ok: false, message: 'fail', retriable: true };
    });
    const controller = new AbortController();
    const promise = withRetry(attempt, controller.signal);
    // Attempt 1 has run synchronously; the loop is now awaiting the first delay.
    expect(callCount).toBe(1);
    controller.abort();
    const result = await promise;
    expect(result).toEqual({
      ok: false,
      retriable: false,
      message: 'Request cancelled',
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('returns a non-retriable failure outcome even when the signal aborts after the attempt', async () => {
    const attempt = vi.fn(
      async (): Promise<AttemptOutcome<string>> => ({
        ok: false,
        message: 'validation',
        retriable: false,
      }),
    );
    const controller = new AbortController();
    const promise = withRetry(attempt, controller.signal);
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ ok: false, message: 'validation', retriable: false });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('withAttemptTimeout external cancellation', () => {
  it('aborts the internal signal before run when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: boolean[] = [];
    const result = await withAttemptTimeout(
      1_000,
      async (signal) => {
        seen.push(signal.aborted);
        return 'done';
      },
      controller.signal,
    );
    expect(result).toBe('done');
    expect(seen[0]).toBe(true);
  });

  it('aborts the in-flight run when the external signal fires', async () => {
    const controller = new AbortController();
    const promise = withAttemptTimeout(
      5_000,
      async (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(promise).rejects.toThrow('aborted');
  });

  it('removes the external-abort listener after run resolves to avoid leaks', async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');
    await withAttemptTimeout(1_000, async () => 'done', controller.signal);
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    removeSpy.mockRestore();
  });
});
