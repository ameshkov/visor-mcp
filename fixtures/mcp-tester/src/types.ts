import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Arguments passed to a tool case's assertion. Provides everything a fixture
 * needs to validate the result of a single `tools/call` invocation.
 */
export interface ToolCaseContext {
  /** Name of the tool that was called. */
  readonly toolName: string;
  /** Arguments that were sent to the tool. */
  readonly arguments: Readonly<Record<string, unknown>>;
  /** Result returned by the server. */
  readonly result: CallToolResult;
}

/**
 * A single executable test case for a tool. Throw inside {@link ToolCase.assert}
 * to mark the case as failed; return normally to mark it as passed.
 */
export interface ToolCase {
  /** Short, human-readable case name. Must be unique within a fixture. */
  readonly name: string;
  /** Optional longer description of what the case verifies. */
  readonly description?: string;
  /** Arguments sent to the tool when this case runs. */
  readonly arguments: Readonly<Record<string, unknown>>;
  /**
   * When true, the case is skipped unless `MCP_TESTER_LIVE=1` is set. Gate
   * cases that make real provider calls with this flag.
   */
  readonly live?: boolean;
  /** Assertion callback. Throw to fail; return normally to pass. */
  assert(ctx: ToolCaseContext): void | Promise<void>;
}

/**
 * A group of cases targeting one tool. Each `.case.ts` file in `cases/`
 * default-exports one of these.
 */
export interface ToolFixture {
  /** Name of the tool this fixture targets. */
  readonly tool: string;
  /** Cases to run against the tool. */
  readonly cases: readonly ToolCase[];
}

/** Status of a single case execution. */
export type CaseStatus = 'passed' | 'failed' | 'skipped';

/** Result of running one case. */
export interface CaseResult {
  readonly tool: string;
  readonly case: string;
  readonly status: CaseStatus;
  /** Present when `status` is `failed` or `skipped`. */
  readonly reason?: string;
}

/** Aggregate result for one tool across all its cases. */
export interface ToolSummary {
  readonly tool: string;
  /** Whether the server advertised this tool. */
  readonly discovered: boolean;
  readonly results: readonly CaseResult[];
}
