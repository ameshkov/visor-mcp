/**
 * Barrel exports for the `config/` module — configuration loading, error
 * formatting, and startup diagnostics. External code MUST import from this
 * barrel only.
 */
export { loadConfig } from './config.js';
export type { ServerConfig } from './config.js';
export { formatStartupDiagnostic, errorToolResult } from './errors.js';
