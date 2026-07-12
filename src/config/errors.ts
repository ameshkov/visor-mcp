import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Categorized configuration failure carrying a safe (non-sensitive) message.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Format a startup failure as a sanitized stderr diagnostic. Only ConfigError
 * messages (curated to be safe) are surfaced verbatim; any other error is
 * reduced to a generic message so internal details never leak to stderr.
 */
export function formatStartupDiagnostic(error: unknown): string {
  const message =
    error instanceof ConfigError ? error.message : 'Startup failed: invalid configuration.';
  return `Error: ${message}\n`;
}

/**
 * Sanitized not-yet-implemented tool result. Begins with "Error:" and discloses
 * no configured or request-sensitive data.
 */
export function notImplementedToolResult(toolName: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: `Error: ${toolName} is not yet implemented.` }],
    isError: true,
  };
}

/**
 * Sanitized tool error result. `message` must be a curated, non-sensitive
 * string produced by this package; it is prefixed with `Error:` (without
 * double-prefixing) and the result is marked `isError: true`.
 */
export function errorToolResult(message: string): CallToolResult {
  const text = message.startsWith('Error:') ? message : `Error: ${message}`;
  return { content: [{ type: 'text' as const, text }], isError: true };
}
