#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatStartupDiagnostic, loadConfig } from './config/index.js';
import { createServer } from './server/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Check whether argv contains --version or -v, exiting 0 if so. */
function handleVersionFlag(argv: string[]): void {
  if (!argv.includes('--version') && !argv.includes('-v')) return;

  const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
    version: string;
  };
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

async function main(): Promise<void> {
  try {
    const config = loadConfig({ env: process.env, cwd: process.cwd() });
    const server = createServer(config);
    await server.start();
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(formatStartupDiagnostic(error));
  }
}

handleVersionFlag(process.argv);
await main();
