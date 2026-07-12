import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from '../config/index.js';
import { registerTools } from './tools.js';

// Not exported: referenced only as the return type of `createServer` within
// this module, so exporting it would trip Knip. Consumers use the value
// structurally.
interface VisionMcpServer {
  readonly start: () => Promise<void>;
}

export function createServer(config: ServerConfig): VisionMcpServer {
  const mcp = new McpServer(
    { name: 'vision-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(mcp, config);
  return {
    async start() {
      const transport = new StdioServerTransport();
      await mcp.connect(transport);
    },
  };
}
