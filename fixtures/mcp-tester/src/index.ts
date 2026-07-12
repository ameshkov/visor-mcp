import { loadTesterConfig } from './config.js';
import { withClient } from './client.js';
import { loadFixtures, runAll } from './runner.js';
import { report } from './report.js';

/**
 * Entry point. Loads `.env`, spawns the vision-mcp server, discovers its
 * tools, runs every matching `*.case.ts` fixture, prints a summary, and sets
 * a nonzero exit code when any case failed.
 */
async function main(): Promise<void> {
  const config = loadTesterConfig();
  const fixtures = await loadFixtures(config.fixturesDir);
  if (fixtures.length === 0) {
    process.stderr.write(`No fixtures found in ${config.fixturesDir}\n`);
    process.exitCode = 1;
    return;
  }
  const args = config.serverArgs.join(' ');
  process.stdout.write(
    `Loaded ${fixtures.length} fixture(s) from ${config.fixturesDir}\n` +
      `Spawning server: ${config.serverCommand} ${args} (cwd: ${config.serverCwd})\n` +
      `Live cases: ${config.live ? 'on' : 'off'}\n`,
  );
  try {
    const exitCode = await withClient(config, async (client) => {
      const summaries = await runAll(client, fixtures, { live: config.live });
      return report(summaries);
    });
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Tester failed: ${message}\n`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Tester failed: ${message}\n`);
  process.exitCode = 1;
}
