import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

const ENV_VARS = [
  'VISION_MCP_API_KEY',
  'VISION_MCP_BASE_URL',
  'VISION_MCP_MODEL',
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
  it('documents all six environment variables', () => {
    for (const name of ENV_VARS) {
      expect(readme).toContain(name);
    }
  });

  it('documents all seven tools', () => {
    for (const name of TOOLS) {
      expect(readme).toContain(name);
    }
  });

  it('documents the ui_to_artifact output_type enum and field', () => {
    expect(readme).toContain('output_type');
    // The four enum values are common English words likely to appear
    // elsewhere in a ~400-line README; assert them as an ordered,
    // contiguous sequence (any non-word separators) so a future edit that
    // deletes the enum list cannot pass because the bare words happen to
    // survive in unrelated prose.
    expect(readme).toMatch(/code[^\w]+prompt[^\w]+spec[^\w]+description/i);
  });

  it('documents supported image sources', () => {
    expect(readme).toContain('data URL');
    // Anchor "absolute" to the distinctive image-source phrase; the bare
    // word "absolute" also appears in the Security section.
    expect(readme).toMatch(/absolute\s+local\s+file\s+path/i);
    expect(readme).toMatch(/HTTP\/HTTPS|HTTP\/HTTPS URL/);
  });

  it('documents supported and rejected image formats', () => {
    for (const fmt of ['PNG', 'JPEG', 'WebP', 'GIF']) {
      expect(readme).toContain(fmt);
    }
    expect(readme).toContain('SVG');
    expect(readme).toMatch(/animated/);
    expect(readme).toMatch(/malformed/);
  });

  it('documents the data flow to the provider', () => {
    expect(readme).toMatch(/image bytes and prompts|images and prompts are sent/);
    // Anchor "provider" to the data-flow disclosure phrasing; the bare
    // word appears dozens of times throughout the README.
    expect(readme).toMatch(/sent\s+to\s+(the\s+)?(configured\s+)?provider/i);
  });

  it('documents retry and per-attempt timeout behavior', () => {
    // These three assertions also pass against the 21-line scaffold
    // README (it mentions "retries", the env var, and "60,000"), so they
    // alone give zero regression protection for the detailed policy.
    expect(readme).toMatch(/retr(y|ies)/);
    expect(readme).toContain('VISION_MCP_REQUEST_TIMEOUT_MS');
    expect(readme).toMatch(/60[, ]?000|60000/);
    // The two assertions below require phrasing unique to the operator
    // guide's "Reliability & Cancellation" section (Task 2 §8) that the
    // scaffold lacks: the explicit per-attempt timer reset, and the
    // "1 s then 2 s" backoff phrasing. The scaffold spells the delays as
    // "one-second and two-second" and writes "1 s + 2 s" inside its
    // worst-case parenthetical — never with the "then" connector — so
    // both assertions fail on the scaffold and pass on the new README.
    expect(readme).toMatch(/fresh\s+timer|each\s+retry\s+gets\s+a\s+fresh/i);
    expect(readme).toMatch(/1\s*s\s+then\s+2\s*s/i);
  });

  it('documents cancellation behavior', () => {
    expect(readme).toMatch(/cancel/);
    expect(readme).toContain('Request cancelled');
  });

  it('documents installation and MCP host setup', () => {
    // Require an actual package-manager install command, not the bare
    // word "install"/"installation".
    expect(readme).toMatch(/npm\s+install|pnpm\s+install/);
    expect(readme).toMatch(/mcpServers|mcp\s+servers|MCP\s+host/);
    expect(readme).toContain('vision-mcp');
  });

  it('documents security and privacy risks', () => {
    // Distinctive phrases unique to the security disclosures; the bare
    // word "absolute" also appears in the image-sources section.
    expect(readme).toMatch(/private\s+network/i);
    expect(readme).toMatch(/loopback/);
    expect(readme).toMatch(/RFC\s?1918/i);
    expect(readme).toMatch(/unencrypted/);
    expect(readme).toMatch(/unrestricted/);
    // Absolute-file-access risk framed as a security disclosure.
    expect(readme).toMatch(/can\s+read\s+any\s+absolute/i);
  });

  it('documents troubleshooting with curated error messages', () => {
    expect(readme).toMatch(/Troubleshooting/);
    const curated = [
      'provider request failed',
      'malformed provider response',
      'image exceeds the configured size limit',
      'image declared format does not match its bytes',
      'image source scheme is not supported',
    ];
    for (const message of curated) {
      expect(readme).toContain(message);
    }
  });

  it('documents stdout/stderr discipline', () => {
    expect(readme).toContain('stderr');
    expect(readme).toContain('stdout');
  });

  it('documents the license and reference attribution', () => {
    expect(readme).toContain('MIT');
    expect(readme).toContain('@z_ai/mcp-server');
  });
});
