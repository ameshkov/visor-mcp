/**
 * Barrel exports for the `services/` module — provider API integration and
 * image loading. Each service lives in its own subdirectory with a barrel
 * `index.ts`; this file aggregates them into a single public API. External
 * code MUST import from this barrel only.
 */
export { analyze } from './provider/index.js';
export { loadImage } from './images/index.js';
export type { ValidatedImage } from './images/index.js';
