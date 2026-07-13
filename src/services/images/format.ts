import { Buffer } from 'node:buffer';
import { extname } from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_SIGNATURE = Buffer.from([0x57, 0x45, 0x42, 0x50]);
const GIF87A_SIGNATURE = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89A_SIGNATURE = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const NETSCAPE_2_0 = Buffer.from([
  0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
]);

/**
 * Canonical MIME constants for the supported static image formats.
 *
 * Single source of truth for the supported-image MIME set. Each canonical
 * MIME literal appears exactly once here; `detectFormat` returns,
 * `IMAGE_MIME_TYPES`, and the values of `EXT_TO_MIME` all derive from this
 * object so the declared-format mismatch check (see
 * `assertDeclaredImageMimeMatches`) can never desync from byte detection.
 *
 * When adding or removing a supported format: add or remove the entry
 * here AND add or remove the magic-byte detection branch in `detectFormat`
 * (and, if the format has a recognizable file extension, the entry in
 * `EXT_TO_MIME`). `IMAGE_MIME_TYPES` updates automatically.
 */
const IMAGE_MIME = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const;

const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(Object.values(IMAGE_MIME));

const EXT_TO_MIME: Readonly<Record<string, string>> = {
  '.png': IMAGE_MIME.png,
  '.jpg': IMAGE_MIME.jpeg,
  '.jpeg': IMAGE_MIME.jpeg,
  '.webp': IMAGE_MIME.webp,
  '.gif': IMAGE_MIME.gif,
};

/**
 * Detects an image's MIME type from its actual bytes, or returns null when
 * the bytes are not a supported static image format.
 *
 * @param bytes - The raw image bytes to inspect.
 * @returns The detected MIME type, or null for unsupported content.
 */
export function detectFormat(bytes: Uint8Array): string | null {
  if (matchesPrefix(bytes, PNG_SIGNATURE)) return IMAGE_MIME.png;
  if (matchesPrefix(bytes, JPEG_SIGNATURE)) return IMAGE_MIME.jpeg;
  if (isWebP(bytes)) return IMAGE_MIME.webp;
  if (isStaticGif(bytes)) return IMAGE_MIME.gif;
  return null;
}

/**
 * Throws when the declared MIME conflicts with the detected MIME type.
 *
 * The comparison is skipped when no declaration is available or when the
 * declared MIME is not one of the supported canonical image MIMEs (see
 * `IMAGE_MIME` / `IMAGE_MIME_TYPES`), so that `application/octet-stream`,
 * `image/jpg` (non-canonical alias), `image/svg+xml`, or an absent/empty
 * header never trigger a spurious mismatch. Byte detection always remains
 * authoritative.
 *
 * @param declared - Raw declared MIME extracted from a data-URL prefix, a
 *   file-extension mapping, or an HTTP Content-Type header. May be undefined
 *   or empty when the source did not declare a MIME.
 * @param detected - The MIME detected from the image bytes by `detectFormat`.
 * @throws {Error} `'image declared format does not match its bytes'` when
 *   the declared MIME is a recognized canonical image MIME and differs from
 *   the detected MIME.
 */
export function assertDeclaredImageMimeMatches(
  declared: string | undefined,
  detected: string,
): void {
  if (!declared) return;
  const normalized = declared.trim().toLowerCase();
  if (!IMAGE_MIME_TYPES.has(normalized)) return;
  if (normalized !== detected) {
    throw new Error('image declared format does not match its bytes');
  }
}

/**
 * Maps a file path's extension to its canonical image MIME type.
 *
 * @param filePath - Absolute local path to inspect.
 * @returns The canonical image MIME for a recognized image extension, or
 *   undefined when the extension is absent or not a supported image
 *   extension (including `.svg`, `.dat`, and no extension).
 */
export function extensionToImageMime(filePath: string): string | undefined {
  return EXT_TO_MIME[extname(filePath).toLowerCase()];
}

/**
 * Parses an HTTP `Content-Type` header into a canonical image MIME.
 *
 * @param header - Raw Content-Type header value, or null when the response
 *   carried no Content-Type header.
 * @returns The canonical image MIME when the header names a recognized image
 *   type (with parameters like `; charset=utf-8` stripped), or undefined
 *   otherwise.
 */
export function contentTypeToImageMime(header: string | null): string | undefined {
  if (!header) return undefined;
  const mime = header.split(';')[0].trim().toLowerCase();
  return IMAGE_MIME_TYPES.has(mime) ? mime : undefined;
}

function matchesPrefix(bytes: Uint8Array, prefix: Buffer): boolean {
  if (bytes.length < prefix.length) return false;
  return Buffer.from(bytes.subarray(0, prefix.length)).equals(prefix);
}

function isWebP(bytes: Uint8Array): boolean {
  if (!matchesPrefix(bytes, RIFF_SIGNATURE)) return false;
  if (bytes.length < 12) return false;
  return Buffer.from(bytes.subarray(8, 12)).equals(WEBP_SIGNATURE);
}

function isStaticGif(bytes: Uint8Array): boolean {
  if (!matchesPrefix(bytes, GIF87A_SIGNATURE) && !matchesPrefix(bytes, GIF89A_SIGNATURE)) {
    return false;
  }
  return !Buffer.from(bytes).includes(NETSCAPE_2_0);
}
