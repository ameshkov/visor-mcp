#!/usr/bin/env node

import { formatStartupDiagnostic, loadConfig } from './config/index.js';
import { createServer } from './server/index.js';

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

await main();
