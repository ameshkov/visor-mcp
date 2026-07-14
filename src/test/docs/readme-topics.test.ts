import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

const REQUIRED_ENV_VARS = ['VISION_MCP_API_KEY', 'VISION_MCP_BASE_URL', 'VISION_MCP_MODEL'];

const OPTIONAL_ENV_VARS = [
  'VISION_MCP_MAX_IMAGE_SIZE_MB',
  'VISION_MCP_REQUEST_TIMEOUT_MS',
  'VISION_MCP_REQUEST_BODY_JSON',
];

const TOOLS = [
  'ui_diff_check',
  'ui_to_artifact',
  'extract_text_from_screenshot',
  'diagnose_error_screenshot',
  'understand_technical_diagram',
  'analyze_image',
  'analyze_data_visualization',
];

describe('README operator guide', () => {
  it('documents the three required environment variables in quick-start examples', () => {
    for (const name of REQUIRED_ENV_VARS) {
      expect(readme).toContain(name);
    }
  });

  it('does not inline the optional environment variables (delegated to docs/configuration.md)', () => {
    for (const name of OPTIONAL_ENV_VARS) {
      expect(readme).not.toContain(name);
    }
  });

  it('links to the configuration documentation', () => {
    expect(readme).toContain('docs/configuration.md');
  });

  it('documents all seven tools', () => {
    for (const name of TOOLS) {
      expect(readme).toContain(name);
    }
  });

  it('documents the ui_to_artifact output_type enum and field', () => {
    expect(readme).toContain('output_type');
    // The four enum values are common English words likely to appear
    // elsewhere; assert them as an ordered, contiguous sequence (any
    // non-word separators) so a future edit that deletes the enum list
    // cannot pass because the bare words happen to survive in unrelated
    // prose.
    expect(readme).toMatch(/code[^\w]+prompt[^\w]+spec[^\w]+description/i);
  });

  it('links to the tools documentation', () => {
    expect(readme).toContain('docs/tools.md');
  });

  it('documents quick-start and MCP host setup', () => {
    expect(readme).toContain('vision-mcp');
  });

  it('links to agent MCP documentation for each host', () => {
    expect(readme).toContain('https://opencode.ai/docs/mcp-servers/');
    expect(readme).toContain('https://code.claude.com/docs/en/mcp');
    expect(readme).toContain('https://developers.openai.com/codex/mcp');
    expect(readme).toContain('https://code.visualstudio.com/docs/agent-customization/mcp-servers');
  });

  it('documents the license and reference attribution', () => {
    expect(readme).toContain('MIT');
    expect(readme).toContain('@z_ai/mcp-server');
  });
});
