import type { CaseResult, CaseStatus, ProgressEvent, ToolSummary } from './types.js';

/**
 * Whether to emit ANSI color. Enabled on a TTY (or when `FORCE_COLOR=1`),
 * disabled when piped or when `NO_COLOR` is set, so CI logs stay clean.
 */
const useColor =
  process.env.FORCE_COLOR === '1' || (process.stdout.isTTY === true && !process.env.NO_COLOR);

const paint = (text: string, code: number): string =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const green = (s: string): string => paint(s, 32);
const red = (s: string): string => paint(s, 31);
const yellow = (s: string): string => paint(s, 33);
const dim = (s: string): string => paint(s, 2);
const bold = (s: string): string => paint(s, 1);

/**
 * Print a {@link ProgressEvent} live as the runner executes each fixture, in
 * a vitest-like style. Tool events print a group header before a tool's
 * cases run; case events print the case outcome (with per-case duration) the
 * moment it finishes, so slow live runs show progress immediately instead of
 * buffering everything until the end.
 */
export function printProgress(event: ProgressEvent): void {
  if (event.type === 'tool') {
    process.stdout.write(formatToolHeader(event.tool, event.discovered, event.caseCount));
    return;
  }
  process.stdout.write(formatCase(event.result));
}

function formatToolHeader(tool: string, discovered: boolean, caseCount: number): string {
  const noun = caseCount === 1 ? 'test' : 'tests';
  const count = dim(`(${caseCount} ${noun})`);
  const discovery = discovered ? '' : ` ${red('(NOT discovered)')}`;
  return `\n ${bold(tool)}${discovery} ${count}\n`;
}

function formatCase(result: CaseResult): string {
  const icon = iconFor(result.status);
  if (result.status === 'skipped') {
    const reason = result.reason ?? 'skipped';
    return `   ${icon} ${result.case}  ${dim(`(skipped: ${reason})`)}\n`;
  }
  const duration = dim(`${result.durationMs ?? 0}ms`);
  let out = `   ${icon} ${result.case}  ${duration}\n`;
  if (result.status === 'failed' && result.reason) {
    const indented = result.reason
      .split('\n')
      .map((line) => `     ${line}`)
      .join('\n');
    out += `${red(indented)}\n`;
  }
  return out;
}

/** Icon (with color) for a case status, in the vitest style. */
function iconFor(status: CaseStatus): string {
  switch (status) {
    case 'passed':
      return green('✓');
    case 'failed':
      return red('✗');
    case 'skipped':
      return yellow('↓');
  }
}

/**
 * Print the final vitest-style summary (Tools / Tests / Duration) from the
 * completed summaries and return the process exit code: `0` when no case
 * failed, `1` otherwise.
 */
export function printTotals(summaries: readonly ToolSummary[], totalDurationMs: number): number {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const summary of summaries) {
    for (const result of summary.results) {
      counts[result.status] += 1;
    }
  }
  const total = counts.passed + counts.failed + counts.skipped;
  const toolsTotal = summaries.length;
  const toolsFailed = summaries.filter((s) => s.results.some((r) => r.status === 'failed')).length;
  const toolsPassed = toolsTotal - toolsFailed;

  const lines = [
    ` ${'Tools'.padStart(8)}  ${toolsLine(toolsPassed, toolsFailed, toolsTotal)}`,
    ` ${'Tests'.padStart(8)}  ${testsLine(counts, total)}`,
    ` ${'Duration'.padStart(8)}  ${formatDuration(totalDurationMs)}`,
  ];
  process.stdout.write('\n' + lines.join('\n') + '\n');
  return counts.failed > 0 ? 1 : 0;
}

function toolsLine(passed: number, failed: number, total: number): string {
  const parts = [green(`${passed} passed`)];
  if (failed > 0) parts.push(red(`${failed} failed`));
  return `${parts.join(' | ')} ${dim(`(${total})`)}`;
}

function testsLine(
  counts: { passed: number; failed: number; skipped: number },
  total: number,
): string {
  const parts = [green(`${counts.passed} passed`)];
  if (counts.failed > 0) parts.push(red(`${counts.failed} failed`));
  if (counts.skipped > 0) parts.push(yellow(`${counts.skipped} skipped`));
  return `${parts.join(' | ')} ${dim(`(${total})`)}`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}
