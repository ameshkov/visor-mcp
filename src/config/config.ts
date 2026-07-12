import dotenv from 'dotenv';
import { join } from 'node:path';
import { ConfigError } from './errors.js';

// ServerConfig is now consumed by server.ts, tools.ts, and provider.ts, so it
// is exported. `LoadConfigOptions` stays module-private.
export interface ServerConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly maxImageSizeMb: number;
  readonly requestTimeoutMs: number;
  readonly requestBodyExtras: Readonly<Record<string, unknown>>;
  readonly chatCompletionsEndpoint: string;
}

interface LoadConfigOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
}

const PROTECTED_TOP_LEVEL = new Set(['model', 'messages', 'stream']);
const FORBIDDEN_ANYWHERE = new Set(['__proto__', 'prototype', 'constructor']);

export function loadConfig(options: LoadConfigOptions): ServerConfig {
  const merged = mergeEnv(options.env, loadEnvFile(options.cwd));
  const apiKey = requireString(merged, 'VISION_MCP_API_KEY');
  const baseUrl = validateBaseUrl(merged.VISION_MCP_BASE_URL);
  const model = requireString(merged, 'VISION_MCP_MODEL');
  const maxImageSizeMb = parsePositiveNumber(
    merged.VISION_MCP_MAX_IMAGE_SIZE_MB,
    5,
    'VISION_MCP_MAX_IMAGE_SIZE_MB',
  );
  const requestTimeoutMs = parsePositiveInteger(
    merged.VISION_MCP_REQUEST_TIMEOUT_MS,
    60_000,
    'VISION_MCP_REQUEST_TIMEOUT_MS',
  );
  const requestBodyExtras = parseRequestExtras(merged.VISION_MCP_REQUEST_BODY_JSON);
  return Object.freeze<ServerConfig>({
    apiKey,
    baseUrl,
    model,
    maxImageSizeMb,
    requestTimeoutMs,
    requestBodyExtras,
    chatCompletionsEndpoint: composeEndpoint(baseUrl),
  });
}

function loadEnvFile(cwd: string): Record<string, string> {
  const fileEnv: Record<string, string> = {};
  dotenv.config({ path: join(cwd, '.env'), override: false, processEnv: fileEnv, quiet: true });
  return fileEnv;
}

function mergeEnv(
  env: NodeJS.ProcessEnv,
  fileEnv: Record<string, string>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...fileEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function requireString(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new ConfigError(`${name} is required`);
  }
  return value;
}

function validateBaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim().length === 0) {
    throw new ConfigError('VISION_MCP_BASE_URL is required');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('VISION_MCP_BASE_URL must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('VISION_MCP_BASE_URL must use http or https');
  }
  return raw;
}

function composeEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}/chat/completions`;
}

function parsePositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive number`);
  }
  return n;
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer`);
  }
  return n;
}

function parseRequestExtras(raw: string | undefined): Readonly<Record<string, unknown>> {
  if (raw === undefined || raw.trim().length === 0) return deepFreeze({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('VISION_MCP_REQUEST_BODY_JSON must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError('VISION_MCP_REQUEST_BODY_JSON must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  assertNoProtectedTopLevel(obj);
  assertNoForbiddenKeysDeep(obj);
  return deepFreeze(obj);
}

function assertNoProtectedTopLevel(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (PROTECTED_TOP_LEVEL.has(key)) {
      throw new ConfigError('VISION_MCP_REQUEST_BODY_JSON contains a protected key');
    }
  }
}

function assertNoForbiddenKeysDeep(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeysDeep(item);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_ANYWHERE.has(key)) {
      throw new ConfigError('VISION_MCP_REQUEST_BODY_JSON contains a forbidden key');
    }
    assertNoForbiddenKeysDeep(obj[key]);
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    const obj = value as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(obj)) deepFreeze(obj[key]);
  }
  return Object.freeze(value);
}
