/**
 * Barrel exports for the `utils/` module — shared helpers consumed across
 * layers. External code MUST import from this barrel only.
 *
 * `retry.ts` exposes the retry policy and per-attempt timeout driver used by
 * the provider and image-download services.
 */
export { withRetry, withAttemptTimeout, isTransientStatus, CANCELLED_MESSAGE } from './retry.js';
export type { AttemptOutcome } from './retry.js';
