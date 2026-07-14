import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { chmodSync, existsSync } from 'node:fs';
import { loadImage } from './images.js';
import {
  TINY_PNG_BASE64,
  TINY_PNG_DATA_URL,
  TINY_PNG_BYTES,
  TINY_JPEG_DATA_URL,
  TINY_JPEG_BASE64,
  TINY_JPEG_BYTES,
  TINY_WEBP_DATA_URL,
  TINY_WEBP_BASE64,
  TINY_WEBP_BYTES,
  TINY_GIF_DATA_URL,
  TINY_GIF_BASE64,
  TINY_GIF_BYTES,
  TINY_ANIMATED_GIF_BYTES,
  writeTempFile,
  createTempDir,
  startMockImageServer,
  type MockImageServer,
} from '../../test/utils/index.js';

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const onPosix = process.platform !== 'win32';

describe('loadImage data URL', () => {
  it('accepts a valid base64 PNG data URL and canonicalizes it', async () => {
    const image = await loadImage(TINY_PNG_DATA_URL, 5, 60_000);
    expect(image.mimeType).toBe('image/png');
    expect(image.bytes.byteLength).toBeGreaterThan(0);
    expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
  });

  it('rejects malformed base64', async () => {
    await expect(loadImage('data:image/png;base64,!!!notbase64!!!', 5, 60_000)).rejects.toThrow(
      /base64/,
    );
  });

  it('rejects a non-base64 data URL', async () => {
    await expect(loadImage('data:image/png,abc', 5, 60_000)).rejects.toThrow(/base64 data URL/);
  });

  it('rejects a non-data-url plain string', async () => {
    await expect(loadImage('not a data url', 5, 60_000)).rejects.toThrow(/base64 data URL/);
  });

  it('rejects an image exceeding the configured size limit', async () => {
    // 1e-6 MB ~= 1 byte; the tiny PNG decodes to ~67 bytes and is rejected
    // before decoding fully via the base64-length estimate.
    await expect(loadImage(TINY_PNG_DATA_URL, 1e-6, 60_000)).rejects.toThrow(/size limit/);
  });

  it('rejects SVG bytes as an unsupported format', async () => {
    const svg = Buffer.from('<svg></svg>').toString('base64');
    await expect(loadImage(`data:image/png;base64,${svg}`, 5, 60_000)).rejects.toThrow(
      /supported format/,
    );
  });

  it('accepts a JPEG data URL and canonicalizes it', async () => {
    const image = await loadImage(TINY_JPEG_DATA_URL, 5, 60_000);
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.dataUrl).toBe(`data:image/jpeg;base64,${TINY_JPEG_BASE64}`);
  });

  it('accepts a static GIF data URL and canonicalizes it', async () => {
    const image = await loadImage(TINY_GIF_DATA_URL, 5, 60_000);
    expect(image.mimeType).toBe('image/gif');
    expect(image.dataUrl).toBe(`data:image/gif;base64,${TINY_GIF_BASE64}`);
  });

  it('rejects an animated GIF data URL as unsupported', async () => {
    const animated = `data:image/gif;base64,${Buffer.from(TINY_ANIMATED_GIF_BYTES).toString('base64')}`;
    await expect(loadImage(animated, 5, 60_000)).rejects.toThrow(/supported format/);
  });
});

describe('loadImage local file', () => {
  it('accepts an absolute readable PNG file and canonicalizes it', async () => {
    const file = writeTempFile(TINY_PNG_BYTES);
    try {
      const image = await loadImage(file.path, 5, 60_000);
      expect(image.mimeType).toBe('image/png');
      expect(image.bytes.byteLength).toBe(TINY_PNG_BYTES.byteLength);
      // Round-trips the file bytes back to the canonical data URL, proving the
      // file (not the data URL) was read.
      expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
    } finally {
      file.cleanup();
    }
  });

  it('rejects a relative path', async () => {
    await expect(loadImage('relative/path.png', 5, 60_000)).rejects.toThrow(/absolute file path/);
  });

  it('rejects a local file exceeding the configured size limit', async () => {
    // TINY_PNG_BYTES is ~67 bytes; 1e-5 MB floors to 10 bytes.
    const file = writeTempFile(TINY_PNG_BYTES);
    try {
      await expect(loadImage(file.path, 1e-5, 60_000)).rejects.toThrow(/size limit/);
    } finally {
      file.cleanup();
    }
  });
});

describe('loadImage local file rejection', () => {
  it('rejects a missing file as not found', async () => {
    // An absolute path whose parent (`/`) exists but the file does not → ENOENT.
    const missing = `/nonexistent-vision-mcp-${Date.now()}.png`;
    await expect(loadImage(missing, 5, 60_000)).rejects.toThrow(/was not found/);
  });

  it.skipIf(!onPosix || isRoot)('rejects an unreadable file', async () => {
    const file = writeTempFile(TINY_PNG_BYTES);
    try {
      chmodSync(file.path, 0o000);
      await expect(loadImage(file.path, 5, 60_000)).rejects.toThrow(/could not be read/);
    } finally {
      chmodSync(file.path, 0o600);
      file.cleanup();
    }
  });

  it('rejects a directory', async () => {
    const dir = createTempDir('vision-mcp-dir-');
    try {
      await expect(loadImage(dir.path, 5, 60_000)).rejects.toThrow(/is not a file/);
    } finally {
      dir.cleanup();
    }
  });

  it.skipIf(!existsSync('/dev/null'))('rejects a non-file device', async () => {
    await expect(loadImage('/dev/null', 5, 60_000)).rejects.toThrow(/is not a file/);
  });
});

describe('loadImage scheme classification', () => {
  it.each([
    ['ftp scheme', 'ftp://example.test/a.png'],
    ['file scheme', 'file:///etc/passwd'],
    ['ws scheme', 'ws://example.test/x'],
  ])('rejects an unsupported URL scheme: %s', async (_name, source) => {
    await expect(loadImage(source, 5, 60_000)).rejects.toThrow(/scheme is not supported/);
  });
});

describe('loadImage http url', () => {
  let server: MockImageServer;
  beforeEach(async () => {
    server = await startMockImageServer();
    server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
  });
  afterEach(async () => {
    await server.close();
  });

  it('downloads, validates, and inlines a PNG over HTTP', async () => {
    const image = await loadImage(`${server.url}/png`, 5, 60_000);
    expect(image.mimeType).toBe('image/png');
    expect(image.bytes.byteLength).toBe(TINY_PNG_BYTES.byteLength);
    expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].method).toBe('GET');
    expect(server.requests[0].authorization).toBeUndefined();
    expect(server.requests[0].cookie).toBeUndefined();
  });

  it('does not transmit the URL fragment', async () => {
    await loadImage(`${server.url}/png#section`, 5, 60_000);
    expect(server.requests[0].path).toBe('/png');
  });

  it('does not transmit URL credentials', async () => {
    const withCreds = server.url.replace('http://', 'http://user:pass@');
    await loadImage(`${withCreds}/png`, 5, 60_000);
    expect(server.requests[0].authorization).toBeUndefined();
    expect(server.requests[0].cookie).toBeUndefined();
  });

  it('transmits the query string but redacts it from errors', async () => {
    const err = await loadImage(`${server.url}/missing?secret=value`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
    expect((err as Error).message).not.toMatch(/secret|value/);
    expect(server.requests[0].path).toBe('/missing?secret=value');
  });

  it('rejects a non-2xx response as a download failure', async () => {
    server.setRoute('/gone', { status: 404 });
    await expect(loadImage(`${server.url}/gone`, 5, 60_000)).rejects.toThrow(/download failed/);
  });

  it('rejects a non-image 200 response', async () => {
    server.setRoute('/html', { status: 200, body: '<html></html>' });
    await expect(loadImage(`${server.url}/html`, 5, 60_000)).rejects.toThrow(/supported format/);
  });

  it('rejects an oversized response', async () => {
    server.setRoute('/big', { status: 200, body: Buffer.alloc(10, 0x89) });
    await expect(loadImage(`${server.url}/big`, 1e-6, 60_000)).rejects.toThrow(/size limit/);
  });

  it('accepts an HTTPS URL (scheme validated, fetch attempted)', async () => {
    // HTTPS to a plain-HTTP mock server fails the TLS handshake; the error
    // is a download failure, NOT a scheme rejection, proving https is
    // accepted. Under the retry policy, TLS handshake failures are
    // retriable connection failures → 3 attempts with 1s+2s real backoff.
    // The mock server never sees these requests (TLS fails before HTTP).
    const httpsUrl = server.url.replace('http://', 'https://');
    const err = await loadImage(`${httpsUrl}/png`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
    expect((err as Error).message).not.toMatch(/scheme is not supported/);
  }, 10_000);
});

describe('loadImage http redirects', () => {
  let server: MockImageServer;
  beforeEach(async () => {
    server = await startMockImageServer();
    server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
  });
  afterEach(async () => {
    await server.close();
  });

  it('follows a redirect chain to the final image', async () => {
    server.setRoute('/start', { status: 302, headers: { location: '/png' } });
    const image = await loadImage(`${server.url}/start`, 5, 60_000);
    expect(image.mimeType).toBe('image/png');
    expect(image.dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
  });

  it('follows exactly five redirects', async () => {
    for (let i = 0; i < 5; i++) {
      server.setRoute(`/r${i}`, { status: 302, headers: { location: `/r${i + 1}` } });
    }
    server.setRoute('/r5', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
    const image = await loadImage(`${server.url}/r0`, 5, 60_000);
    expect(image.mimeType).toBe('image/png');
  });

  it('rejects when redirects exceed five', async () => {
    for (let i = 0; i <= 5; i++) {
      server.setRoute(`/r${i}`, { status: 302, headers: { location: `/r${i + 1}` } });
    }
    server.setRoute('/r6', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
    await expect(loadImage(`${server.url}/r0`, 5, 60_000)).rejects.toThrow(/redirect limit/);
  });

  it('rejects a redirect to an unsupported scheme', async () => {
    server.setRoute('/start', {
      status: 302,
      headers: { location: 'ftp://example.test/x.png' },
    });
    await expect(loadImage(`${server.url}/start`, 5, 60_000)).rejects.toThrow(
      /scheme is not supported/,
    );
  });

  it('rejects a redirect with no location header', async () => {
    server.setRoute('/start', { status: 302 });
    await expect(loadImage(`${server.url}/start`, 5, 60_000)).rejects.toThrow(/location/);
  });

  it('accepts an HTTPS redirect target', async () => {
    // Redirect target is HTTPS → TLS handshake fails on the mock HTTP
    // server. Under retry policy this is retriable → 3 attempts (TLS
    // failures don't reach the HTTP server).
    server.setRoute('/start', {
      status: 302,
      headers: { location: `${server.url.replace('http://', 'https://')}/png` },
    });
    const err = await loadImage(`${server.url}/start`, 5, 60_000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download failed/);
    expect((err as Error).message).not.toMatch(/scheme is not supported/);
  }, 10_000);

  it('preserves the query string across a redirect', async () => {
    server.setRoute('/start', { status: 302, headers: { location: '/png?token=abc' } });
    const image = await loadImage(`${server.url}/start`, 5, 60_000);
    expect(image.mimeType).toBe('image/png');
    expect(server.requests[1].path).toBe('/png?token=abc');
  });
});

describe('startMockImageServer', () => {
  it('serves a configured route and captures the request', async () => {
    const server = await startMockImageServer();
    try {
      server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
      const res = await fetch(`${server.url}/png`);
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBe(TINY_PNG_BYTES.byteLength);
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0].method).toBe('GET');
      expect(server.requests[0].path).toBe('/png');
      expect(server.requests[0].authorization).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});

describe('loadImage format matrix across source kinds', () => {
  let server: MockImageServer;
  beforeEach(async () => {
    server = await startMockImageServer();
    server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
    server.setRoute('/jpeg', { status: 200, body: Buffer.from(TINY_JPEG_BYTES) });
    server.setRoute('/webp', { status: 200, body: Buffer.from(TINY_WEBP_BYTES) });
    server.setRoute('/gif', { status: 200, body: Buffer.from(TINY_GIF_BYTES) });
  });
  afterEach(async () => {
    await server.close();
  });

  const FIXTURES = [
    {
      label: 'PNG',
      dataUrl: TINY_PNG_DATA_URL,
      bytes: TINY_PNG_BYTES,
      base64: TINY_PNG_BASE64,
      mime: 'image/png',
      route: '/png',
      filename: 'image.png',
    },
    {
      label: 'JPEG',
      dataUrl: TINY_JPEG_DATA_URL,
      bytes: TINY_JPEG_BYTES,
      base64: TINY_JPEG_BASE64,
      mime: 'image/jpeg',
      route: '/jpeg',
      filename: 'image.jpg',
    },
    {
      label: 'WebP',
      dataUrl: TINY_WEBP_DATA_URL,
      bytes: TINY_WEBP_BYTES,
      base64: TINY_WEBP_BASE64,
      mime: 'image/webp',
      route: '/webp',
      filename: 'image.webp',
    },
    {
      label: 'static GIF',
      dataUrl: TINY_GIF_DATA_URL,
      bytes: TINY_GIF_BYTES,
      base64: TINY_GIF_BASE64,
      mime: 'image/gif',
      route: '/gif',
      filename: 'image.gif',
    },
  ] as const;

  for (const f of FIXTURES) {
    const expectedDataUrl = `data:${f.mime};base64,${f.base64}`;

    describe(`${f.label} across source kinds`, () => {
      it('accepts from a data URL with the detected MIME type', async () => {
        const image = await loadImage(f.dataUrl, 5, 60_000);
        expect(image.mimeType).toBe(f.mime);
        expect(image.dataUrl).toBe(expectedDataUrl);
      });

      it('accepts from a local file with the detected MIME type', async () => {
        const file = writeTempFile(f.bytes, f.filename);
        try {
          const image = await loadImage(file.path, 5, 60_000);
          expect(image.mimeType).toBe(f.mime);
          expect(image.dataUrl).toBe(expectedDataUrl);
        } finally {
          file.cleanup();
        }
      });

      it('accepts from an HTTP URL with the detected MIME type', async () => {
        const image = await loadImage(`${server.url}${f.route}`, 5, 60_000);
        expect(image.mimeType).toBe(f.mime);
        expect(image.dataUrl).toBe(expectedDataUrl);
      });
    });
  }
});

describe('loadImage size override uniformity across source kinds', () => {
  let server: MockImageServer;
  beforeEach(async () => {
    server = await startMockImageServer();
    server.setRoute('/png', { status: 200, body: Buffer.from(TINY_PNG_BYTES) });
  });
  afterEach(async () => {
    await server.close();
  });

  it('applies the same positive override to data URL, file, and HTTP sources', async () => {
    const file = writeTempFile(TINY_PNG_BYTES);
    try {
      // 1e-6 MB floors to ~1 byte; the tiny PNG decodes to ~67 bytes and
      // exceeds it. Every source kind must reject with the same error.
      await expect(loadImage(TINY_PNG_DATA_URL, 1e-6, 60_000)).rejects.toThrow(/size limit/);
      await expect(loadImage(file.path, 1e-6, 60_000)).rejects.toThrow(/size limit/);
      await expect(loadImage(`${server.url}/png`, 1e-6, 60_000)).rejects.toThrow(/size limit/);
    } finally {
      file.cleanup();
    }
  });
});
