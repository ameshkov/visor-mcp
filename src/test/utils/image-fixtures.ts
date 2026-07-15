// Shared test support — image fixtures. Knip excludes `src/test/**` from
// its analysis (see `knip.config.ts`), so test-only exports here are not
// flagged as unused.

import { Buffer } from 'node:buffer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// A real 1x1 transparent PNG; decoded bytes begin with the PNG signature.
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

export const baseEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VISOR_MCP_')),
) as NodeJS.ProcessEnv;

export const TINY_PNG_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.from(TINY_PNG_BASE64, 'base64'),
);

// Minimal JPEG fixture — begins with the SOI + APP0 (JFIF) magic bytes.
export const TINY_JPEG_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
);
export const TINY_JPEG_BASE64 = Buffer.from(TINY_JPEG_BYTES).toString('base64');
export const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

// Minimal WebP fixture — RIFF container with a WEBP form type.
export const TINY_WEBP_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
);
export const TINY_WEBP_BASE64 = Buffer.from(TINY_WEBP_BYTES).toString('base64');
export const TINY_WEBP_DATA_URL = `data:image/webp;base64,${TINY_WEBP_BASE64}`;

// A real 1x1 static GIF89a (transparent). No NETSCAPE2.0 extension.
// Bytes-first so the base64 round-trips canonically by construction.
export const TINY_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const TINY_GIF_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.from(TINY_GIF_BASE64, 'base64'),
);
export const TINY_GIF_DATA_URL = `data:image/gif;base64,${TINY_GIF_BASE64}`;

// A GIF89a carrying the NETSCAPE2.0 application extension (the standard
// animation marker). Proves animated GIFs are rejected by byte detection.
export const TINY_ANIMATED_GIF_BYTES: Readonly<Uint8Array> = Uint8Array.from(
  Buffer.concat([
    // GIF89a header + a minimal logical screen descriptor.
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]),
    // NETSCAPE2.0 application extension: animation looping marker.
    Buffer.from([
      0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03,
      0x01, 0x00, 0x00, 0x00,
    ]),
    // GIF trailer.
    Buffer.from([0x3b]),
  ]),
);
