// Shared test support — temp file helpers. Knip excludes `src/test/**` from
// its analysis.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface TempFile {
  readonly path: string;
  cleanup(): void;
}

export function createTempDir(prefix = 'vision-mcp-'): TempFile {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeTempFile(data: Uint8Array, name = 'image.png'): TempFile {
  const dir = createTempDir('vision-mcp-file-');
  const filePath = join(dir.path, name);
  writeFileSync(filePath, data);
  return {
    path: filePath,
    cleanup: () => rmSync(dir.path, { recursive: true, force: true }),
  };
}
