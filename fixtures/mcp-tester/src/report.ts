import type { CaseResult, ToolSummary } from './types.js';

/** Print a per-tool breakdown and totals line; return the process exit code. */
export function report(summaries: readonly ToolSummary[]): number {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  process.stdout.write('\nResults\n-------\n');
  for (const summary of summaries) {
    printTool(summary);
    for (const result of summary.results) {
      counts[result.status] += 1;
      printCase(result);
    }
  }
  process.stdout.write('\n');
  process.stdout.write(
    `Total: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped\n`,
  );
  return counts.failed > 0 ? 1 : 0;
}

function printTool(summary: ToolSummary): void {
  const discovery = summary.discovered ? 'discovered' : 'NOT discovered';
  process.stdout.write(`\n${summary.tool} (${discovery})\n`);
}

function printCase(result: CaseResult): void {
  const label = labelFor(result.status);
  process.stdout.write(`  ${label} ${result.case}\n`);
  if (result.reason !== undefined && result.reason.length > 0) {
    process.stdout.write(`        ${result.reason}\n`);
  }
}

function labelFor(status: CaseResult['status']): string {
  switch (status) {
    case 'passed':
      return '[pass]';
    case 'failed':
      return '[fail]';
    case 'skipped':
      return '[skip]';
  }
}
