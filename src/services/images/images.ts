import { Buffer } from 'node:buffer';
import { open, type FileHandle } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { isAbsolute } from 'node:path';
import { assertDeclaredImageMimeMatches, detectFormat, extensionToImageMime } from './format.js';
import { loadHttpImage } from './http-image.js';
import { CANCELLED_MESSAGE } from '../../utils/index.js';

export interface ValidatedImage {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly dataUrl: string;
}

const DATA_URL_RE = /^data:([^;,]*)?(;base64)?,(.*)$/;
const STRICT_BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const READ_CHUNK_SIZE = 65_536;

type ImageSource =
  | {
      readonly kind: 'dataUrl';
      readonly data: string;
      readonly declaredMime: string | undefined;
    }
  | { readonly kind: 'httpUrl'; readonly url: string }
  | { readonly kind: 'filePath'; readonly path: string };

export async function loadImage(
  source: string,
  maxImageSizeMb: number,
  requestTimeoutMs: number,
  signal?: AbortSignal,
): Promise<ValidatedImage> {
  if (signal?.aborted) {
    throw new Error(CANCELLED_MESSAGE);
  }
  const maxBytes = Math.floor(maxImageSizeMb * 1024 * 1024);
  const classified = classifySource(source);
  switch (classified.kind) {
    case 'dataUrl':
      return loadDataUrlImage(classified.data, classified.declaredMime, maxBytes, signal);
    case 'httpUrl':
      return loadHttpImage(classified.url, maxBytes, requestTimeoutMs, signal);
    case 'filePath':
      return loadFileImage(classified.path, maxBytes, signal);
  }
}

function classifySource(source: string): ImageSource {
  const match = DATA_URL_RE.exec(source);
  if (match) {
    if (match[2] !== ';base64') {
      throw new Error('image source must be a base64 data URL');
    }
    const data = match[3] ?? '';
    if (!STRICT_BASE64_RE.test(data) || data.length % 4 !== 0) {
      throw new Error('image source has malformed base64');
    }
    return { kind: 'dataUrl', data, declaredMime: match[1] };
  }
  let parsed: URL | undefined;
  try {
    parsed = new URL(source);
  } catch {
    parsed = undefined;
  }
  if (parsed) {
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { kind: 'httpUrl', url: source };
    }
    throw new Error('image source scheme is not supported');
  }
  if (isAbsolute(source)) {
    return { kind: 'filePath', path: source };
  }
  throw new Error('image source must be an absolute file path, HTTP/HTTPS URL, or base64 data URL');
}

async function loadDataUrlImage(
  data: string,
  declaredMime: string | undefined,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<ValidatedImage> {
  if (signal?.aborted) {
    throw new Error(CANCELLED_MESSAGE);
  }
  if (decodedByteLength(data) > maxBytes) {
    throw new Error('image exceeds the configured size limit');
  }
  const bytes = Buffer.from(data, 'base64');
  const mimeType = detectFormat(bytes);
  if (mimeType === null) {
    throw new Error('image is not a supported format');
  }
  assertDeclaredImageMimeMatches(declaredMime, mimeType);
  return {
    mimeType,
    bytes,
    dataUrl: `data:${mimeType};base64,${data}`,
  };
}

async function loadFileImage(
  path: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<ValidatedImage> {
  if (signal?.aborted) {
    throw new Error(CANCELLED_MESSAGE);
  }
  let handle: FileHandle | undefined;
  try {
    handle = await openFileHandle(path);
    const stat = await statFileHandle(handle);
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }
    if (!stat.isFile()) {
      throw new Error('image source is not a file');
    }
    const bytes = await readBounded(handle, maxBytes, signal);
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }
    const mimeType = detectFormat(bytes);
    if (mimeType === null) {
      throw new Error('image is not a supported format');
    }
    assertDeclaredImageMimeMatches(extensionToImageMime(path), mimeType);
    return {
      mimeType,
      bytes,
      dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    };
  } finally {
    await handle?.close();
  }
}

async function readBounded(
  handle: FileHandle,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunkSize = Math.min(READ_CHUNK_SIZE, Math.max(1, maxBytes + 1));
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }
    const buffer = Buffer.alloc(chunkSize);
    const bytesRead = await readFileChunk(handle, buffer, chunkSize, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes) {
      throw new Error('image exceeds the configured size limit');
    }
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks);
}

async function openFileHandle(path: string): Promise<FileHandle> {
  try {
    return await open(path, 'r');
  } catch (error) {
    throw sanitizeFsError(error);
  }
}

async function statFileHandle(handle: FileHandle): Promise<Stats> {
  try {
    return await handle.stat();
  } catch (error) {
    throw sanitizeFsError(error);
  }
}

async function readFileChunk(
  handle: FileHandle,
  buffer: Buffer,
  length: number,
  position: number,
): Promise<number> {
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return bytesRead;
  } catch (error) {
    throw sanitizeFsError(error);
  }
}

function sanitizeFsError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ENOENT'
    ? new Error('image source file was not found')
    : new Error('image source file could not be read');
}

function decodedByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (len * 3) / 4 - padding;
}
