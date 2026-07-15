import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { ConfigError } from './errors.js';

const valid = {
  VISOR_MCP_API_KEY: 'test-key',
  VISOR_MCP_BASE_URL: 'https://example.test/v1',
  VISOR_MCP_MODEL: 'test-model',
};

function withEnv(env: Record<string, string | undefined>): Parameters<typeof loadConfig>[0] {
  return { env, cwd: tmpdir() };
}

function tmpDirWithEnv(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'vmcp-'));
  writeFileSync(join(dir, '.env'), contents);
  return dir;
}

describe('loadConfig precedence', () => {
  it('process env wins over .env and .env fills unset values', () => {
    const dir = tmpDirWithEnv(
      'VISOR_MCP_API_KEY=fromfile\nVISOR_MCP_BASE_URL=https://file.test/v1\nVISOR_MCP_MODEL=filemodel\n',
    );
    try {
      const cfg = loadConfig({ env: { VISOR_MCP_API_KEY: 'fromprocess' }, cwd: dir });
      expect(cfg.apiKey).toBe('fromprocess');
      expect(cfg.baseUrl).toBe('https://file.test/v1');
      expect(cfg.model).toBe('filemodel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadConfig defaults', () => {
  it('applies defaults for optional values', () => {
    const cfg = loadConfig(withEnv(valid));
    expect(cfg.maxImageSizeMb).toBe(5);
    expect(cfg.requestTimeoutMs).toBe(60_000);
    expect(cfg.requestBodyExtras).toEqual({});
  });
});

describe('loadConfig required-field validation', () => {
  it.each([
    ['missing api key', { VISOR_MCP_BASE_URL: 'https://x.test', VISOR_MCP_MODEL: 'm' }, /API_KEY/],
    ['missing base url', { VISOR_MCP_API_KEY: 'k', VISOR_MCP_MODEL: 'm' }, /BASE_URL/],
    ['missing model', { VISOR_MCP_API_KEY: 'k', VISOR_MCP_BASE_URL: 'https://x.test' }, /MODEL/],
    ['empty api key', { ...valid, VISOR_MCP_API_KEY: '   ' }, /API_KEY/],
  ])('rejects %s', (_name, env, pattern) => {
    expect(() => loadConfig(withEnv(env))).toThrow(pattern);
  });

  it('throws ConfigError', () => {
    expect(() => loadConfig(withEnv({}))).toThrow(ConfigError);
  });
});

describe('loadConfig base URL scheme', () => {
  it.each([
    ['ftp scheme', 'ftp://x.test', /http or https/],
    ['invalid url', 'not a url', /valid URL/],
  ])('rejects %s', (_name, baseUrl, pattern) => {
    expect(() => loadConfig(withEnv({ ...valid, VISOR_MCP_BASE_URL: baseUrl }))).toThrow(pattern);
  });

  it('accepts http and https', () => {
    const http = loadConfig(withEnv({ ...valid, VISOR_MCP_BASE_URL: 'http://localhost:8080' }));
    const https = loadConfig(withEnv({ ...valid, VISOR_MCP_BASE_URL: 'https://x.test' }));
    expect(http.chatCompletionsEndpoint).toBe('http://localhost:8080/chat/completions');
    expect(https.chatCompletionsEndpoint).toBe('https://x.test/chat/completions');
  });
});

describe('endpoint composition', () => {
  it.each([
    ['https://api.test/v1', 'https://api.test/v1/chat/completions'],
    ['https://api.test/v1/', 'https://api.test/v1/chat/completions'],
    ['https://api.test', 'https://api.test/chat/completions'],
    ['https://api.test/', 'https://api.test/chat/completions'],
    ['http://localhost:8080', 'http://localhost:8080/chat/completions'],
  ])('composes %s -> %s', (baseUrl, expected) => {
    const cfg = loadConfig(withEnv({ ...valid, VISOR_MCP_BASE_URL: baseUrl }));
    expect(cfg.chatCompletionsEndpoint).toBe(expected);
  });
});

describe('request extras validation', () => {
  it('parses a valid object', () => {
    const cfg = loadConfig(
      withEnv({ ...valid, VISOR_MCP_REQUEST_BODY_JSON: '{"reasoning_effort":"high"}' }),
    );
    expect(cfg.requestBodyExtras).toEqual({ reasoning_effort: 'high' });
  });

  it.each([
    ['malformed json', '{bad', /valid JSON/],
    ['array', '[]', /JSON object/],
    ['null', 'null', /JSON object/],
    ['top-level model', '{"model":"x"}', /protected/],
    ['top-level messages', '{"messages":[]}', /protected/],
    ['top-level stream', '{"stream":true}', /protected/],
    ['top-level __proto__', '{"__proto__":{}}', /forbidden/],
    ['nested __proto__', '{"a":{"__proto__":{}}}', /forbidden/],
    ['nested prototype', '{"a":{"prototype":1}}', /forbidden/],
    ['nested constructor', '{"a":{"constructor":1}}', /forbidden/],
  ])('rejects %s', (_name, raw, pattern) => {
    expect(() => loadConfig(withEnv({ ...valid, VISOR_MCP_REQUEST_BODY_JSON: raw }))).toThrow(
      pattern,
    );
  });
});

describe('config immutability', () => {
  it('returns a frozen config with deep-frozen extras', () => {
    const cfg = loadConfig(withEnv({ ...valid, VISOR_MCP_REQUEST_BODY_JSON: '{"a":{"b":1}}' }));
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.requestBodyExtras)).toBe(true);
    expect(Object.isFrozen((cfg.requestBodyExtras as Record<string, unknown>).a as object)).toBe(
      true,
    );
  });
});
