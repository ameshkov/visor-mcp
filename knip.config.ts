import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts!'],
  project: ['src/**/*.ts!', '!src/**/*.test.ts'],
  tags: ['-internal'],
  ignoreDependencies: ['@modelcontextprotocol/sdk', 'dotenv', 'zod'],
};

export default config;
