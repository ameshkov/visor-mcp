import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../../config/index.js';
import type { Tool } from './common.js';
import { analyzeImage } from './analyze-image.js';
import { analyzeDataVisualization } from './analyze-data-visualization.js';
import { diagnoseErrorScreenshot } from './diagnose-error-screenshot.js';
import { extractTextFromScreenshot } from './extract-text-from-screenshot.js';
import { understandTechnicalDiagram } from './understand-technical-diagram.js';
import { uiDiffCheck } from './ui-diff-check.js';
import { uiToArtifact } from './ui-to-artifact.js';

/**
 * @internal Exported for tests only; not part of the public module API.
 *
 * Catalog of every registered tool, in discovery order: the visual-
 * regression `ui_diff_check`, then the specialized tools, then the
 * general-purpose `analyze_image` fallback, with `analyze_data_visualization`
 * last. This order is what `tools/list` advertises to clients.
 */
export const TOOLS: readonly Tool[] = [
  uiDiffCheck,
  uiToArtifact,
  extractTextFromScreenshot,
  diagnoseErrorScreenshot,
  understandTechnicalDiagram,
  analyzeImage,
  analyzeDataVisualization,
];

/**
 * Registers every tool in {@link TOOLS} onto the MCP server, each wired to
 * the given configuration.
 */
export function registerTools(server: McpServer, config: ServerConfig): void {
  for (const tool of TOOLS) {
    tool.register(server, config);
  }
}
