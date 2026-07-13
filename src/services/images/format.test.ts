import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  assertDeclaredImageMimeMatches,
  contentTypeToImageMime,
  detectFormat,
  extensionToImageMime,
} from './format.js';
import {
  TINY_PNG_BYTES,
  TINY_JPEG_BYTES,
  TINY_WEBP_BYTES,
  TINY_GIF_BYTES,
  TINY_ANIMATED_GIF_BYTES,
} from '../../test/utils/index.js';

describe('detectFormat', () => {
  it('detects a PNG', () => {
    expect(detectFormat(Buffer.from(TINY_PNG_BYTES))).toBe('image/png');
  });

  it('detects a JPEG', () => {
    expect(detectFormat(Buffer.from(TINY_JPEG_BYTES))).toBe('image/jpeg');
  });

  it('rejects SVG text', () => {
    expect(detectFormat(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a truncated PNG signature', () => {
    expect(detectFormat(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it('detects a WebP', () => {
    expect(detectFormat(Buffer.from(TINY_WEBP_BYTES))).toBe('image/webp');
  });

  it('rejects a RIFF file that is not a WebP', () => {
    // RIFF....WAVE — a valid RIFF container (WAV), not a WebP image.
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectFormat(wav)).toBeNull();
  });

  it('rejects a truncated RIFF header', () => {
    expect(detectFormat(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]))).toBeNull();
  });

  it('detects a static GIF', () => {
    expect(detectFormat(Buffer.from(TINY_GIF_BYTES))).toBe('image/gif');
  });

  it('rejects an animated GIF', () => {
    expect(detectFormat(Buffer.from(TINY_ANIMATED_GIF_BYTES))).toBeNull();
  });

  it('rejects a truncated GIF signature', () => {
    expect(detectFormat(Buffer.from([0x47, 0x49, 0x46]))).toBeNull();
  });
});

describe('assertDeclaredImageMimeMatches', () => {
  it('passes when no declared MIME is given', () => {
    expect(() => assertDeclaredImageMimeMatches(undefined, 'image/png')).not.toThrow();
    expect(() => assertDeclaredImageMimeMatches('', 'image/png')).not.toThrow();
  });

  it('passes when the declared MIME equals the detected MIME', () => {
    expect(() => assertDeclaredImageMimeMatches('image/png', 'image/png')).not.toThrow();
    expect(() => assertDeclaredImageMimeMatches('image/jpeg', 'image/jpeg')).not.toThrow();
  });

  it('passes when the declared MIME is not a recognized canonical image MIME', () => {
    expect(() =>
      assertDeclaredImageMimeMatches('application/octet-stream', 'image/png'),
    ).not.toThrow();
    expect(() => assertDeclaredImageMimeMatches('image/jpg', 'image/png')).not.toThrow();
    expect(() => assertDeclaredImageMimeMatches('image/svg+xml', 'image/png')).not.toThrow();
  });

  it('normalizes case and surrounding whitespace before comparing', () => {
    expect(() => assertDeclaredImageMimeMatches('IMAGE/PNG', 'image/png')).not.toThrow();
    expect(() => assertDeclaredImageMimeMatches('  Image/Jpeg  ', 'image/jpeg')).not.toThrow();
  });

  it('throws when the declared MIME conflicts with the detected MIME', () => {
    expect(() => assertDeclaredImageMimeMatches('image/jpeg', 'image/png')).toThrow(
      /declared format/,
    );
    expect(() => assertDeclaredImageMimeMatches('image/png', 'image/gif')).toThrow(
      /declared format/,
    );
  });
});

describe('extensionToImageMime', () => {
  it('maps recognized image extensions to canonical MIME types', () => {
    expect(extensionToImageMime('/tmp/foo.png')).toBe('image/png');
    expect(extensionToImageMime('/tmp/foo.jpg')).toBe('image/jpeg');
    expect(extensionToImageMime('/tmp/foo.jpeg')).toBe('image/jpeg');
    expect(extensionToImageMime('/tmp/foo.webp')).toBe('image/webp');
    expect(extensionToImageMime('/tmp/foo.gif')).toBe('image/gif');
  });

  it('is case-insensitive on the extension', () => {
    expect(extensionToImageMime('/tmp/FOO.PNG')).toBe('image/png');
    expect(extensionToImageMime('/tmp/foo.JPG')).toBe('image/jpeg');
  });

  it('returns undefined for an unrecognized or absent extension', () => {
    expect(extensionToImageMime('/tmp/foo.dat')).toBeUndefined();
    expect(extensionToImageMime('/tmp/foo.svg')).toBeUndefined();
    expect(extensionToImageMime('/tmp/foo')).toBeUndefined();
  });
});

describe('contentTypeToImageMime', () => {
  it('returns the canonical MIME for a recognized image Content-Type', () => {
    expect(contentTypeToImageMime('image/png')).toBe('image/png');
    expect(contentTypeToImageMime('image/jpeg')).toBe('image/jpeg');
  });

  it('strips parameters such as charset', () => {
    expect(contentTypeToImageMime('image/png; charset=utf-8')).toBe('image/png');
  });

  it('normalizes case', () => {
    expect(contentTypeToImageMime('IMAGE/PNG')).toBe('image/png');
  });

  it('returns undefined for a non-image Content-Type or absent header', () => {
    expect(contentTypeToImageMime('application/octet-stream')).toBeUndefined();
    expect(contentTypeToImageMime('text/html')).toBeUndefined();
    expect(contentTypeToImageMime(null)).toBeUndefined();
    expect(contentTypeToImageMime('')).toBeUndefined();
  });
});
