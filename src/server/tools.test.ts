import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TOOL_DEFINITIONS } from './tools.js';

const EXPECTED_NAMES = [
  'ui_to_artifact',
  'extract_text_from_screenshot',
  'diagnose_error_screenshot',
  'understand_technical_diagram',
  'analyze_data_visualization',
  'ui_diff_check',
  'analyze_image',
];

const DESCRIPTIONS: Record<string, string> = {
  ui_to_artifact:
    'Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description. Use it for UI design conversion, not OCR, error diagnosis, technical diagrams, or charts.',
  extract_text_from_screenshot:
    'Extract text from screenshots containing source code, terminal output, configuration, documentation, or general prose. Use it for OCR rather than UI conversion, diagnosis, or diagram interpretation.',
  diagnose_error_screenshot:
    'Analyze a screenshot containing an error, exception, or stack trace and provide diagnosis and corrective action. Use it for error analysis, not generic OCR, UI conversion, or diagram understanding.',
  understand_technical_diagram:
    'Explain architecture diagrams, flowcharts, UML, entity relationship diagrams, sequence diagrams, and other technical visualizations. Use it for technical structure and flow, not UI screenshots, errors, or data charts.',
  analyze_data_visualization:
    'Analyze charts, graphs, and dashboards to extract metrics, patterns, anomalies, and actionable insights. Use it for visualized data rather than UI mockups, errors, or architecture diagrams.',
  ui_diff_check:
    'Compare an expected UI screenshot with an actual implementation to identify visual and implementation discrepancies. Use it for design-to-build verification, not unordered image comparison or single-image analysis.',
  analyze_image:
    'General-purpose image analysis for requests that do not fit any specialized tool. It is the fallback rather than an alternative name for a specialized workflow.',
};

function schemaOf(name: string): z.ZodTypeAny {
  const def = TOOL_DEFINITIONS.find((t) => t.name === name);
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
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toHaveLength(7);
    expect(names).toEqual(EXPECTED_NAMES);
    expect(names).not.toContain('analyze_video');
  });

  it('descriptions match the compatibility contract verbatim', () => {
    for (const def of TOOL_DEFINITIONS) {
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

  it('rejects unknown fields (closed schemas)', () => {
    const schema = schemaOf('analyze_image');
    expect(schema.safeParse({ image_source: 'x', prompt: 'y', surprise: 1 }).success).toBe(false);
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
