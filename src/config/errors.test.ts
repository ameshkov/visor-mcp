import { describe, it, expect } from 'vitest';
import { ConfigError, errorToolResult, formatStartupDiagnostic } from './errors.js';

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

const CURATED_ERROR_MESSAGES = [
  // loadImage / image-source classification (src/services/images/images.ts)
  'image source must be a base64 data URL',
  'image source has malformed base64',
  'image source scheme is not supported',
  'image source must be an absolute file path, HTTP/HTTPS URL, or base64 data URL',
  // image byte / size / format validation
  'image exceeds the configured size limit',
  'image is not a supported format',
  'image source is not a file',
  'image source file was not found',
  'image source file could not be read',
  'image declared format does not match its bytes',
  // http-image download / redirect (src/services/images/http-image.ts)
  'image download failed',
  'image download exceeded the redirect limit',
  'image redirect is missing a location',
  'image redirect is missing a valid location',
  'image redirect scheme is not supported',
  // provider / retry / cancellation
  // (src/services/provider/provider.ts, src/utils/retry.ts)
  'provider request failed',
  'malformed provider response',
  'Request cancelled',
] as const;

describe('errorToolResult single-item contract for every curated failure', () => {
  for (const message of CURATED_ERROR_MESSAGES) {
    it(`produces exactly one Error: text item for: ${message}`, () => {
      const result = errorToolResult(message);
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      const item = result.content[0];
      expect(item.type).toBe('text');
      if (item.type === 'text') {
        expect(item.text).toBe(`Error: ${message}`);
        expect(item.text).toMatch(/^Error:/);
      }
    });
  }
});
