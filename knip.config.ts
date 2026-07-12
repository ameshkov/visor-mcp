import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts!'],
  project: ['src/**/*.ts!', '!src/**/*.test.ts', '!src/test/**'],
  tags: ['-internal'],
  ignoreDependencies: ['@modelcontextprotocol/sdk', 'dotenv', 'zod', 'tsx'],
};

export default config;
