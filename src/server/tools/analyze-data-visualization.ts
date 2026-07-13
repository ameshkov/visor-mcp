import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../config/index.js';
import { runImageAnalysis, nonWhitespaceField, type Tool } from './common.js';

const analyzeVisualizationSchema = z.object({
  image_source: nonWhitespaceField(
    'Data visualization to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path.',
  ),
  prompt: nonWhitespaceField(
    'What insights or information you want to extract from this visualization.',
  ),
  analysis_focus: nonWhitespaceField(
    "Optional: what to focus the analysis on (e.g. 'trends', 'anomalies', 'comparisons', 'performance metrics'). Omit for comprehensive analysis.",
  ).optional(),
});

const ANALYZE_DATA_VISUALIZATION_DESCRIPTION = `Analyze data visualizations, charts, graphs, and dashboards to extract metrics, trends, patterns, anomalies, and actionable insights.

Use this tool ONLY when the user has a data-visualization image and wants to understand the underlying data.

Do NOT use for: UI mockups, error screenshots, or technical architecture diagrams.`;

/**
 * System prompt for the `analyze_data_visualization` tool.
 */
export const ANALYZE_DATA_VISUALIZATION_PROMPT = `# Analyze Data Visualization

You are a data analyst who specializes in extracting decisions from charts,
graphs, and dashboards.

Identify the visualization type, subject, period, categories, axes, units,
legends, annotations, and data sources visible in the image. Extract important
values carefully, including current, starting, minimum, maximum, typical, and
comparative values when shown. Describe direction, rate of change, cycles,
seasonality, category performance, disparities, correlations, and trade-offs.
Call out spikes, drops, outliers, missing data, implausible values, and other
quality concerns. Separate measured facts from hypotheses about causes. Convert
supported findings into practical recommendations and state what additional
data would improve confidence. Avoid false precision when values cannot be read
exactly.

Organize the response as:

1. **Visualization Summary** — chart type, measures, dimensions, period, and
   visible source context.
2. **Key Metrics** — exact values and comparisons where legible, with uncertainty
   noted where necessary.
3. **Trends and Patterns** — direction, rate, cycles, segments, relationships,
   and notable comparisons.
4. **Anomalies and Insights** — unusual observations, supported interpretation,
   and data-quality issues.
5. **Actionable Recommendations** — prioritized actions tied directly to the
   evidence.
`;

type AnalyzeVisualizationArgs = z.infer<typeof analyzeVisualizationSchema>;

function analyzeVisualizationHandler(config: ServerConfig) {
  return async (args: AnalyzeVisualizationArgs): Promise<CallToolResult> => {
    const userText = args.analysis_focus
      ? `${args.prompt}\n\n<analysis_focus>Focus particularly on: ${args.analysis_focus}.</analysis_focus>`
      : args.prompt;
    return runImageAnalysis(config, args.image_source, {
      systemPrompt: ANALYZE_DATA_VISUALIZATION_PROMPT,
      userText,
    });
  };
}

export const analyzeDataVisualization: Tool = {
  name: 'analyze_data_visualization',
  description: ANALYZE_DATA_VISUALIZATION_DESCRIPTION,
  schema: analyzeVisualizationSchema,
  register(server, config) {
    server.registerTool(
      'analyze_data_visualization',
      {
        description: ANALYZE_DATA_VISUALIZATION_DESCRIPTION,
        inputSchema: analyzeVisualizationSchema,
      },
      analyzeVisualizationHandler(config),
    );
  },
};
