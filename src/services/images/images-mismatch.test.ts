import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { loadImage } from './images.js';
import {
  TINY_PNG_BASE64,
  TINY_PNG_BYTES,
  TINY_JPEG_BYTES,
  TINY_WEBP_BYTES,
  TINY_GIF_BYTES,
  writeTempFile,
  startMockImageServer,
  type MockImageServer,
} from '../../test/utils/index.js';

describe('loadImage data URL declared MIME mismatch', () => {
  it('rejects a data URL whose declared MIME conflicts with its bytes', async () => {
    // Declare image/jpeg but carry PNG bytes — conflict.
    const pngDeclaredAsJpeg = `data:image/jpeg;base64,${TINY_PNG_BASE64}`;
    await expect(loadImage(pngDeclaredAsJpeg, 5)).rejects.toThrow(/declared format/);
  });

  it('still rejects an SVG data URL as unsupported before checking the declared MIME', async () => {
    // image/svg+xml is not a supported format; detectFormat returns null and
    // the existing unsupported-format path fires before any mismatch check.
    const svg = Buffer.from('<svg></svg>').toString('base64');
    await expect(loadImage(`data:image/svg+xml;base64,${svg}`, 5)).rejects.toThrow(
      /supported format/,
    );
  });

  it('accepts a data URL with no declared MIME based on its bytes only', async () => {
    // data:;base64,<png> — declared MIME is empty, so trust bytes only.
    const pngNoMime = `data:;base64,${TINY_PNG_BASE64}`;
    const image = await loadImage(pngNoMime, 5);
    expect(image.mimeType).toBe('image/png');
    expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
  });

  it('accepts a data URL with a non-canonical declared MIME based on its bytes', async () => {
    // image/jpg is not in the canonical set; the check is skipped and bytes
    // remain authoritative.
    const pngNonCanonical = `data:image/jpg;base64,${TINY_PNG_BASE64}`;
    const image = await loadImage(pngNonCanonical, 5);
    expect(image.mimeType).toBe('image/png');
  });
});

describe('loadImage local file extension mismatch', () => {
  it('rejects a file whose extension conflicts with its bytes', async () => {
    // File named image.jpg containing PNG bytes — extension claims image/jpeg,
    // bytes are PNG.
    const file = writeTempFile(TINY_PNG_BYTES, 'image.jpg');
    try {
      await expect(loadImage(file.path, 5)).rejects.toThrow(/declared format/);
    } finally {
      file.cleanup();
    }
  });

  it('accepts a file with a matching extension and bytes', async () => {
    const file = writeTempFile(TINY_PNG_BYTES, 'image.png');
    try {
      const image = await loadImage(file.path, 5);
      expect(image.mimeType).toBe('image/png');
      expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
    } finally {
      file.cleanup();
    }
  });

  it('accepts a file with no recognized extension based on its bytes only', async () => {
    // image.dat — extension not in the map, so no declared MIME; trust bytes.
    const file = writeTempFile(TINY_PNG_BYTES, 'image.dat');
    try {
      const image = await loadImage(file.path, 5);
      expect(image.mimeType).toBe('image/png');
    } finally {
      file.cleanup();
    }
  });
});

describe('loadImage http content-type mismatch', () => {
  let server: MockImageServer;
  beforeEach(async () => {
    server = await startMockImageServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it('rejects a response whose Content-Type conflicts with its bytes', async () => {
    server.setRoute('/png', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.from(TINY_PNG_BYTES),
    });
    await expect(loadImage(`${server.url}/png`, 5)).rejects.toThrow(/declared format/);
  });

  it('accepts a response with a matching Content-Type', async () => {
    server.setRoute('/png', {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(TINY_PNG_BYTES),
    });
    const image = await loadImage(`${server.url}/png`, 5);
    expect(image.mimeType).toBe('image/png');
  });

  it('accepts a response with no Content-Type based on its bytes only', async () => {
    server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
    const image = await loadImage(`${server.url}/png`, 5);
    expect(image.mimeType).toBe('image/png');
  });

  it('accepts a response with a non-image Content-Type based on its bytes', async () => {
    server.setRoute('/png', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from(TINY_PNG_BYTES),
    });
    const image = await loadImage(`${server.url}/png`, 5);
    expect(image.mimeType).toBe('image/png');
  });

  it('rejects JPEG bytes served with an image/png Content-Type', async () => {
    server.setRoute('/jpeg', {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(TINY_JPEG_BYTES),
    });
    await expect(loadImage(`${server.url}/jpeg`, 5)).rejects.toThrow(/declared format/);
  });

  it('rejects WebP bytes served with an image/png Content-Type', async () => {
    server.setRoute('/webp', {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(TINY_WEBP_BYTES),
    });
    await expect(loadImage(`${server.url}/webp`, 5)).rejects.toThrow(/declared format/);
  });

  it('rejects GIF bytes served with an image/png Content-Type', async () => {
    server.setRoute('/gif', {
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(TINY_GIF_BYTES),
    });
    await expect(loadImage(`${server.url}/gif`, 5)).rejects.toThrow(/declared format/);
  });

  it('rejects after a redirect chain when the final Content-Type conflicts with bytes', async () => {
    // Redirect from /redir-start to /conflict-final, which serves PNG bytes
    // with an image/jpeg Content-Type.
    server.setRoute('/redir-start', {
      status: 302,
      headers: { location: '/conflict-final' },
    });
    server.setRoute('/conflict-final', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.from(TINY_PNG_BYTES),
    });
    await expect(loadImage(`${server.url}/redir-start`, 5)).rejects.toThrow(/declared format/);
  });
});
