import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import {
  runImageAnalysis,
  nonWhitespaceField,
  type Tool,
  type ToolHandlerExtra,
} from './common.js';

const understandDiagramSchema = z.object({
  image_source: nonWhitespaceField(
    'Technical diagram to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField('What you want to understand or extract from this diagram.'),
  diagram_type: nonWhitespaceField(
    "Optional: known diagram type (e.g. 'architecture', 'flowchart', 'uml', 'er-diagram', 'sequence'). Omit for auto-detection.",
  ).optional(),
});

const UNDERSTAND_DIAGRAM_DESCRIPTION = `Analyze and explain technical diagrams including architecture diagrams, flowcharts, UML, entity-relationship diagrams, sequence diagrams, and other system-design visuals.

Use this tool ONLY when the user has a technical diagram and wants to understand its structure, components, or data flow.

Do NOT use for: UI screenshots, error messages, or data visualizations/charts.`;

/**
 * System prompt for the `understand_technical_diagram` tool.
 */
export const UNDERSTAND_TECHNICAL_DIAGRAM_PROMPT = `# Understand Technical Diagram

You are a software architect and systems analyst skilled in technical diagrams.

Interpret the supplied diagram and explain its structure, components,
relationships, behavior, and implications. Identify the diagram type and any
notation it uses. Inventory major components and infer responsibilities from
labels and context. Follow arrow direction, cardinality, connection labels, data
flow, control flow, decisions, normal paths, and error paths. Recognize relevant
architectural patterns and non-functional concerns such as availability,
scalability, caching, security, authentication, observability, and operations.
For data models, explain entities, attributes, relationships, and integrity. For
workflows, trace important paths step by step. Assess strengths, coupling,
bottlenecks, complexity, and single points of failure without inventing details.

Organize the response as:

1. **Diagram Overview** — type, scope, abstraction level, purpose, and notation.
2. **Components** — elements grouped by layer, subsystem, or kind, with their
   responsibilities.
3. **Relationships and Data Flow** — interactions, direction, protocols, and
   representative journeys or workflows.
4. **Architecture Analysis** — patterns, strengths, risks, trade-offs, and
   operational implications.
5. **Textual Representation** — when useful or requested, provide a Markdown
   outline, Mermaid or PlantUML description, or ASCII representation.
`;

type UnderstandDiagramArgs = z.infer<typeof understandDiagramSchema>;

function understandDiagramHandler(config: ServerConfig) {
  return async (args: UnderstandDiagramArgs, extra: ToolHandlerExtra): Promise<CallToolResult> => {
    const userText = args.diagram_type
      ? `${args.prompt}\n\n<diagram_type_hint>This is a ${args.diagram_type} diagram.</diagram_type_hint>`
      : args.prompt;
    return runImageAnalysis(
      config,
      args.image_source,
      {
        systemPrompt: UNDERSTAND_TECHNICAL_DIAGRAM_PROMPT,
        userText,
      },
      extra.signal,
    );
  };
}

export const understandTechnicalDiagram: Tool = {
  name: 'understand_technical_diagram',
  description: UNDERSTAND_DIAGRAM_DESCRIPTION,
  schema: understandDiagramSchema,
  register(server, config) {
    server.registerTool(
      'understand_technical_diagram',
      { description: UNDERSTAND_DIAGRAM_DESCRIPTION, inputSchema: understandDiagramSchema },
      understandDiagramHandler(config),
    );
  },
};
