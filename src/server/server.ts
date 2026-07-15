import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from '../config/index.js';
import { registerTools } from './tools/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { name, version } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { name: string; version: string };

// Not exported: referenced only as the return type of `createServer` within
// this module, so exporting it would trip Knip. Consumers use the value
// structurally.
interface VisionMcpServer {
  readonly start: () => Promise<void>;
}

export function createServer(config: ServerConfig): VisionMcpServer {
  const mcp = new McpServer({ name, version }, { capabilities: { tools: {} } });
  registerTools(mcp, config);
  return {
    async start() {
      const transport = new StdioServerTransport();
      await mcp.connect(transport);
    },
  };
}
