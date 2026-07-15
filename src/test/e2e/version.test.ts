import { spawn } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { PROJECT_ROOT } from '../utils/index.js';

function spawnWithArg(arg: string): ReturnType<typeof spawn> {
  return spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', arg], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('--version flag', () => {
  it('prints the version to stdout and exits 0', async () => {
    const child = spawnWithArg('--version');
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 0)));

    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf8').trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Buffer.concat(stderr).toString('utf8')).toBe('');
  }, 10000);

  it('prints the version to stdout and exits 0 with -v short flag', async () => {
    const child = spawnWithArg('-v');
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 0)));

    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf8').trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Buffer.concat(stderr).toString('utf8')).toBe('');
  }, 10000);

  it('does not trigger version when the flag is not set', async () => {
    // Prove that the normal startup path is still exercised (will fail on
    // missing config, but should NOT print the version).
    const child = spawnWithArg('--some-other-arg');
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => stdout.push(c));
    child.stderr!.on('data', (c: Buffer) => stderr.push(c));
    const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 0)));

    expect(code).not.toBe(0);
    const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
    // Should NOT contain a version-only line — if it printed the version,
    // it would be the first line of stdout.
    expect(stdoutText).toBe('');
    expect(Buffer.concat(stderr).toString('utf8')).toMatch(/Error:/);
  }, 10000);
});
