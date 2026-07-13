import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TOOLS } from './index.js';

const EXPECTED_NAMES = [
  'ui_diff_check',
  'ui_to_artifact',
  'extract_text_from_screenshot',
  'diagnose_error_screenshot',
  'understand_technical_diagram',
  'analyze_image',
  'analyze_data_visualization',
];

const DESCRIPTIONS: Record<string, string> = {
  ui_to_artifact: `Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description, selected via output_type.

Use this tool ONLY when the user wants to:
- Generate frontend code from a UI design (output_type='code')
- Create an AI prompt that recreates the UI (output_type='prompt')
- Extract a design specification document (output_type='spec')
- Get a natural-language description of the UI (output_type='description')

Do NOT use for: OCR/text extraction, error diagnosis, technical diagrams, or data visualizations.`,
  extract_text_from_screenshot: `Extract and recognize text from screenshots using OCR, optimized for source code, terminal output, configuration, documentation, and general prose.

Use this tool ONLY when the user has a screenshot containing text and wants that text extracted. It preserves code formatting and honors an optional programming-language hint.

Do NOT use for: UI design conversion, error diagnosis, or diagram understanding.`,
  diagnose_error_screenshot: `Diagnose and analyze error messages, stack traces, and exception screenshots: identify the likely root cause and suggest corrective and preventive action.

Use this tool ONLY when the user has an error screenshot and needs help understanding or fixing it.

Do NOT use for: code/UI extraction, general image analysis, or diagram understanding.`,
  understand_technical_diagram: `Analyze and explain technical diagrams including architecture diagrams, flowcharts, UML, entity-relationship diagrams, sequence diagrams, and other system-design visuals.

Use this tool ONLY when the user has a technical diagram and wants to understand its structure, components, or data flow.

Do NOT use for: UI screenshots, error messages, or data visualizations/charts.`,
  analyze_data_visualization: `Analyze data visualizations, charts, graphs, and dashboards to extract metrics, trends, patterns, anomalies, and actionable insights.

Use this tool ONLY when the user has a data-visualization image and wants to understand the underlying data.

Do NOT use for: UI mockups, error screenshots, or technical architecture diagrams.`,
  ui_diff_check: `Compare an expected/reference UI screenshot with an actual implementation to identify visual and implementation discrepancies for design-to-build verification.

Use this tool ONLY when the user wants to compare an expected/reference UI with an actual implementation.

Do NOT use for: general image comparison, error diagnosis, or analyzing a single UI.`,
  analyze_image: `General-purpose image analysis for scenarios not covered by a specialized tool.

Use this tool as a FALLBACK when none of the specialized tools (ui_to_artifact, extract_text_from_screenshot, diagnose_error_screenshot, understand_technical_diagram, analyze_data_visualization, ui_diff_check) fit the user's need.

Do NOT use for: tasks that match one of the specialized tools above.`,
};

function schemaOf(name: string): z.ZodTypeAny {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) throw new Error(`unknown tool: ${name}`);
  return def.schema;
}

function shape(schema: z.ZodTypeAny): z.ZodRawShape {
  return (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
}

function fields(schema: z.ZodTypeAny): string[] {
  return Object.keys(shape(schema));
}

function required(schema: z.ZodTypeAny): string[] {
  return Object.entries(shape(schema))
    .filter(([, v]) => !(v as z.ZodTypeAny).isOptional())
    .map(([k]) => k);
}

function isOptional(schema: z.ZodTypeAny, key: string): boolean {
  return (shape(schema)[key] as z.ZodTypeAny).isOptional();
}

function enumOf(schema: z.ZodTypeAny, key: string): string[] {
  return (shape(schema)[key] as unknown as z.ZodEnum<[string, ...string[]]>).options;
}

describe('tool catalog contracts', () => {
  it('exposes exactly the seven tools with no video tool', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toHaveLength(7);
    expect(names).toEqual(EXPECTED_NAMES);
    expect(names).not.toContain('analyze_video');
  });

  it('descriptions match the compatibility contract verbatim', () => {
    for (const def of TOOLS) {
      expect(def.description).toBe(DESCRIPTIONS[def.name]);
    }
  });

  it('ui_to_artifact requires image_source, output_type enum, and prompt', () => {
    const schema = schemaOf('ui_to_artifact');
    expect(fields(schema)).toEqual(
      expect.arrayContaining(['image_source', 'output_type', 'prompt']),
    );
    expect(required(schema)).toEqual(
      expect.arrayContaining(['image_source', 'output_type', 'prompt']),
    );
    expect(enumOf(schema, 'output_type')).toEqual(['code', 'prompt', 'spec', 'description']);
  });

  it.each([
    ['extract_text_from_screenshot', 'programming_language'],
    ['diagnose_error_screenshot', 'context'],
    ['understand_technical_diagram', 'diagram_type'],
    ['analyze_data_visualization', 'analysis_focus'],
  ])('%s has a non-required hint field', (name, hint) => {
    const schema = schemaOf(name);
    expect(fields(schema)).toEqual(expect.arrayContaining(['image_source', 'prompt', hint]));
    expect(required(schema)).toEqual(expect.arrayContaining(['image_source', 'prompt']));
    expect(isOptional(schema, hint)).toBe(true);
  });

  it('ui_diff_check requires expected/actual image sources and prompt', () => {
    const schema = schemaOf('ui_diff_check');
    expect(required(schema)).toEqual(
      expect.arrayContaining(['expected_image_source', 'actual_image_source', 'prompt']),
    );
  });

  it('analyze_image requires only image_source and prompt', () => {
    const schema = schemaOf('analyze_image');
    expect(fields(schema)).toEqual(expect.arrayContaining(['image_source', 'prompt']));
    expect(required(schema)).toEqual(expect.arrayContaining(['image_source', 'prompt']));
  });

  it('strips unknown fields for ui_to_artifact (open schema)', () => {
    const schema = schemaOf('ui_to_artifact');
    const result = schema.safeParse({
      image_source: 'x',
      output_type: 'code',
      prompt: 'y',
      surprise: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({
      image_source: 'x',
      output_type: 'code',
      prompt: 'y',
    });
  });

  it('strips unknown fields for extract_text_from_screenshot (open schema)', () => {
    const schema = schemaOf('extract_text_from_screenshot');
    const result = schema.safeParse({
      image_source: 'x',
      prompt: 'y',
      programming_language: 'TypeScript',
      surprise: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({
      image_source: 'x',
      prompt: 'y',
      programming_language: 'TypeScript',
    });
  });

  it('rejects a whitespace-only programming_language for extract_text_from_screenshot', () => {
    const schema = schemaOf('extract_text_from_screenshot');
    expect(
      schema.safeParse({
        image_source: 'x',
        prompt: 'y',
        programming_language: '   ',
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields for diagnose_error_screenshot (open schema)', () => {
    const schema = schemaOf('diagnose_error_screenshot');
    const result = schema.safeParse({
      image_source: 'x',
      prompt: 'y',
      context: 'node 24',
      surprise: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({
      image_source: 'x',
      prompt: 'y',
      context: 'node 24',
    });
  });

  it('rejects a whitespace-only context for diagnose_error_screenshot', () => {
    const schema = schemaOf('diagnose_error_screenshot');
    expect(
      schema.safeParse({
        image_source: 'x',
        prompt: 'y',
        context: '   ',
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields for understand_technical_diagram (open schema)', () => {
    const schema = schemaOf('understand_technical_diagram');
    const result = schema.safeParse({
      image_source: 'x',
      prompt: 'y',
      diagram_type: 'flowchart',
      surprise: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({
      image_source: 'x',
      prompt: 'y',
      diagram_type: 'flowchart',
    });
  });

  it('rejects a whitespace-only diagram_type for understand_technical_diagram', () => {
    const schema = schemaOf('understand_technical_diagram');
    expect(
      schema.safeParse({
        image_source: 'x',
        prompt: 'y',
        diagram_type: '   ',
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields for analyze_data_visualization (open schema)', () => {
    const schema = schemaOf('analyze_data_visualization');
    const result = schema.safeParse({
      image_source: 'x',
      prompt: 'y',
      analysis_focus: 'trends',
      surprise: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({
      image_source: 'x',
      prompt: 'y',
      analysis_focus: 'trends',
    });
  });

  it('rejects a whitespace-only analysis_focus for analyze_data_visualization', () => {
    const schema = schemaOf('analyze_data_visualization');
    expect(
      schema.safeParse({
        image_source: 'x',
        prompt: 'y',
        analysis_focus: '   ',
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields for analyze_image (open schema)', () => {
    const schema = schemaOf('analyze_image');
    const result = schema.safeParse({ image_source: 'x', prompt: 'y', surprise: 1 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('surprise');
    expect(result.data).toMatchObject({ image_source: 'x', prompt: 'y' });
  });

  it('rejects empty or whitespace-only prompt', () => {
    const schema = schemaOf('analyze_image');
    expect(schema.safeParse({ image_source: 'x', prompt: '   ' }).success).toBe(false);
  });

  it('rejects missing required field', () => {
    const schema = schemaOf('analyze_image');
    expect(schema.safeParse({ image_source: 'x' }).success).toBe(false);
  });

  it('rejects an invalid output_type enum value', () => {
    const schema = schemaOf('ui_to_artifact');
    expect(schema.safeParse({ image_source: 'x', output_type: 'nope', prompt: 'y' }).success).toBe(
      false,
    );
  });

  it('accepts valid input', () => {
    const schema = schemaOf('analyze_image');
    expect(schema.safeParse({ image_source: 'x', prompt: 'y' }).success).toBe(true);
  });
});
