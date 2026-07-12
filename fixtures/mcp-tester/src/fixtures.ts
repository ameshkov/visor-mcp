import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Absolute path to the `assets/` directory, resolved relative to this
 * source file so assets are found regardless of the process working
 * directory.
 */
const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/**
 * Load a PNG from the `assets/` directory and return it as a base64
 * `data:` URL ready to pass as `image_source`.
 *
 * Each asset is a real, recognizable image depicting a subject relevant
 * to the tool under test (a smiley face, a bar chart, a flowchart, an
 * error dialog, etc.) rather than a minimal pixel, so providers return a
 * meaningful description instead of ignoring the image as too small.
 *
 * @param filename - PNG file name within `assets/` (e.g. `smiley.png`).
 */
export function pngDataUrl(filename: string): string {
  const base64 = readFileSync(join(assetsDir, filename)).toString('base64');
  return `data:image/png;base64,${base64}`;
}

/** A `text` content part of a {@link CallToolResult}. */
interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * Concatenate every `text` content part of a tool result into a single
 * string. Returns an empty string when no text content is present.
 */
export function resultText(result: CallToolResult): string {
  if (!Array.isArray(result.content)) return '';
  return result.content
    .filter((part): part is TextContent => typeof part === 'object' && part?.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * Assert that a tool result represents a sanitized error: `isError` must be
 * true and the result must carry some text content. Use this for any case
 * that only cares that the call did not succeed (for example SDK schema
 * validation failures, whose message format is owned by the SDK).
 */
export function expectError(result: CallToolResult): void {
  assert.strictEqual(result.isError, true, 'expected isError=true');
  assert.ok(resultText(result).length > 0, 'expected non-empty error text');
}

/**
 * Assert that a tool result represents an error emitted by the server's own
 * handler (via `errorToolResult`): `isError` must be true and the text must
 * begin with `Error:`. Use this when the case targets a handler-emitted
 * error whose message format is owned by this codebase.
 */
export function expectHandlerError(result: CallToolResult): void {
  assert.strictEqual(result.isError, true, 'expected isError=true');
  assert.match(resultText(result), /^Error:/, 'expected text to begin with "Error:"');
}

/**
 * Assert that a tool result represents a sanitized not-implemented error:
 * `isError` must be true and the text must mention that the tool is not yet
 * implemented.
 */
export function expectNotImplemented(result: CallToolResult, toolName: string): void {
  assert.strictEqual(result.isError, true, `${toolName}: expected isError=true`);
  assert.match(
    resultText(result),
    /not yet implemented/,
    `${toolName}: expected "not yet implemented" message`,
  );
}

/**
 * Assert that a tool result is a successful analysis whose text mentions at
 * least one of the given keywords (matched case-insensitively as
 * substrings). Use this for live cases that verify the provider actually
 * recognized the image content rather than returning empty or generic text.
 * Craft the prompt so a correct analysis naturally produces one of the
 * keywords.
 *
 * @param keywords - Words at least one of which must appear in the text.
 */
export function expectKeyword(result: CallToolResult, keywords: readonly string[]): void {
  assert.ok(result.isError !== true, 'expected no error from provider');
  const text = resultText(result);
  const lower = text.toLowerCase();
  const hit = keywords.find((k) => lower.includes(k.toLowerCase()));
  assert.ok(
    hit !== undefined,
    `expected response to mention one of [${keywords.join(', ')}]; got: ${text.slice(0, 200)}`,
  );
}
