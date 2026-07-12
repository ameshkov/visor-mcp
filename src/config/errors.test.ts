import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  errorToolResult,
  formatStartupDiagnostic,
  notImplementedToolResult,
} from './errors.js';

describe('formatStartupDiagnostic', () => {
  it('surfaces ConfigError messages verbatim with an Error prefix', () => {
    const out = formatStartupDiagnostic(new ConfigError('VISION_MCP_API_KEY is required'));
    expect(out).toBe('Error: VISION_MCP_API_KEY is required\n');
  });

  it('reduces unknown errors to a generic sanitized message', () => {
    const out = formatStartupDiagnostic(new Error('https://secret.test/?key=abc'));
    expect(out).toBe('Error: Startup failed: invalid configuration.\n');
    expect(out).not.toContain('secret.test');
    expect(out).not.toContain('abc');
  });
});

describe('notImplementedToolResult', () => {
  it('returns a sanitized error result beginning with Error:', () => {
    const result = notImplementedToolResult('analyze_image');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const item = result.content[0];
    expect(item.type).toBe('text');
    if (item.type === 'text') {
      expect(item.text).toBe('Error: analyze_image is not yet implemented.');
    }
  });
});

describe('errorToolResult', () => {
  it('prefixes a plain message with Error: and marks the result as an error', () => {
    const result = errorToolResult('image source must be a base64 data URL');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Error: image source must be a base64 data URL',
    });
  });

  it('does not double-prefix a message already starting with Error:', () => {
    const result = errorToolResult('Error: provider request failed');
    expect(result.content[0]).toMatchObject({ text: 'Error: provider request failed' });
  });
});
