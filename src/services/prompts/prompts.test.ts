import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getSystemPrompt } from './prompts.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROMPTS_DIR = resolve(PROJECT_ROOT, '.sdd', '.current', 'prompts');

describe('getSystemPrompt', () => {
  it('returns the analyze_image prompt verbatim from the normative catalog', () => {
    const expected = readFileSync(resolve(PROMPTS_DIR, 'analyze-image.md'), 'utf8');
    expect(getSystemPrompt('analyze_image')).toBe(expected);
  });

  it('throws for an unknown prompt name', () => {
    expect(() => getSystemPrompt('nope')).toThrow();
  });
});
