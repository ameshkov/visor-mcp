# Tools

The server exposes seven tools for image analysis. Each tool accepts one
or more image sources and a prompt, and returns a text response from the
configured vision provider. All required and optional string fields must
be non-whitespace. Unknown fields are accepted and silently stripped.

## Contents

- [Common Concepts](#common-concepts)
    - [Image Sources](#image-sources)
    - [Image Formats](#image-formats)
    - [Size Limit](#size-limit)
    - [HTTP Downloads](#http-downloads)
    - [Output Format](#output-format)
- [`analyze_image`](#analyze_image)
- [`ui_to_artifact`](#ui_to_artifact)
- [`extract_text_from_screenshot`](#extract_text_from_screenshot)
- [`diagnose_error_screenshot`](#diagnose_error_screenshot)
- [`understand_technical_diagram`](#understand_technical_diagram)
- [`ui_diff_check`](#ui_diff_check)
- [`analyze_data_visualization`](#analyze_data_visualization)

## Common Concepts

### Image Sources

Every `*_source` parameter accepts one of three sources:

- **Base64 data URL** — a `data:` URL with base64-encoded image bytes
  (e.g. `data:image/png;base64,iVBORw0...`).
- **Absolute local file path** — an absolute path on the machine running
  the server (e.g. `/Users/me/screenshot.png`).
- **HTTP/HTTPS URL** — a publicly accessible URL to download the image
  from (e.g. `https://example.com/image.png`).

Rejected: `ftp:` URLs, `file:` URLs, relative paths, and non-base64 data
URLs.

### Image Formats

Supported formats, detected from image bytes (not file extension or MIME
header):

- PNG
- JPEG
- WebP
- Static GIF

Rejected: SVG, animated GIF, malformed bytes, and content whose detected
format conflicts with its declared type or extension.

### Size Limit

5 MB per image by default, configurable via
`VISOR_MCP_MAX_IMAGE_SIZE_MB`. The limit applies uniformly to local
files, remote downloads, and data URLs — reading, decoding, or
downloading stops immediately when the limit is exceeded.

### HTTP Downloads

Unauthenticated `GET`, at most 5 redirects. Redirects may switch between
HTTP and HTTPS but not to another scheme. Credentials and fragments are
stripped before fetch; query values are redacted from diagnostics.

### Output Format

Every tool returns an MCP `CallToolResult`.

**On success:**

```json
{
  "content": [
    { "type": "text", "text": "<provider text response>" }
  ]
}
```

The `text` is the raw response from the configured OpenAI-compatible
vision provider after the tool's system prompt, user prompt, and image
are sent in a single Chat Completions request.

**On error:**

```json
{
  "content": [
    { "type": "text", "text": "Error: <message>" }
  ],
  "isError": true
}
```

Image-load failures return specific messages (e.g. `"image source must
be an absolute file path, HTTP/HTTPS URL, or base64 data URL"`,
`"image source file was not found"`, `"image is not a supported
format"`, `"image exceeds the configured size limit"`, `"Request
cancelled"`). Provider failures after retries are exhausted return
`"Error: provider request failed"` or `"Error: malformed provider
response"`.

---

## `analyze_image`

### Purpose

General-purpose image analysis. Use this as a **fallback** when none of
the specialized tools (`ui_to_artifact`,
`extract_text_from_screenshot`, `diagnose_error_screenshot`,
`understand_technical_diagram`, `analyze_data_visualization`,
`ui_diff_check`) fit the user's need.

### When to Use

Any image-analysis request that does not match a specialized tool.

### Do NOT Use For

Tasks that match one of the specialized tools above.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | Image to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | What to analyze, extract, or understand from the image. Be specific about your requirements. |

`prompt` drives the analysis focus. The model receives it alongside the
image as the user message in a single Chat Completions request. There
are no optional hint parameters — all instructions must go through
`prompt`.

### System Prompt

The model is instructed to act as an adaptable vision assistant, to
examine the whole image before focusing on the request, to distinguish
observations from inferences, and to explain why observations matter.
The response may include sections for **Main Response**, **Detailed
Observations**, **Context and Analysis**, and **Additional Notes**, but
only those that help answer the specific request.

### Output

Returns a `CallToolResult` with a single text content item containing
the provider's analysis. See [Output Format](#output-format) for success
and error structures.

---

## `ui_to_artifact`

### Purpose

Converts a UI screenshot into one of four artifact types, selected via
`output_type`:

- **`code`** — frontend code (HTML, CSS, React, etc.) that implements
  the design.
- **`prompt`** — an AI generation prompt another model can use to
  recreate the UI.
- **`spec`** — a design specification document for implementation teams.
- **`description`** — a natural-language description of the interface.

### When to Use

- The user wants frontend code generated from a UI design
  (`output_type='code'`).
- The user wants an AI prompt that recreates the UI
  (`output_type='prompt'`).
- The user wants a design specification document
  (`output_type='spec'`).
- The user wants a natural-language description of the UI
  (`output_type='description'`).

### Do NOT Use For

OCR/text extraction, error diagnosis, technical diagrams, or data
visualizations.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | UI screenshot to convert: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `output_type` | enum | **Required** | Type of artifact to generate. Must be one of: `code`, `prompt`, `spec`, `description`. See below for what each value produces. |
| `prompt` | string | **Required** | Detailed instructions for the conversion. State the desired output and any specific requirements (framework, language, level of detail, target audience). |

#### `output_type` Values

| Value | Behavior |
| --- | --- |
| `code` | Generates complete, production-quality frontend code. Prefers semantic HTML, accessible controls, Grid/Flexbox layout. Response includes generated code, structure explanation, styling notes, assumptions, and usage instructions. |
| `prompt` | Generates a comprehensive AI recreation prompt. Captures purpose, regions, hierarchy, visual language, colors, typography, spacing, layout, components, content, and responsive intent. Response includes the generated prompt, structure breakdown, key details captured, and usage notes. |
| `spec` | Generates an implementation-oriented design specification. Identifies design tokens, component patterns, layout rules, hierarchy, states, and responsive behavior. Response includes design tokens, component specifications, layout guidelines, interaction patterns, and implementation notes. |
| `description` | Generates a systematic, natural-language walkthrough. Begins with purpose and composition, then describes each region in reading order with hierarchy, spatial relationships, content, colors, typography, controls, and interaction flow. Response includes overview, detailed description, visual characteristics, and interaction flow. |

`prompt` is sent as the user message alongside the image. It should
include any preferences about framework, language, target audience, or
level of detail so the model can tailor the response.

### System Prompt

The system prompt is chosen at runtime based on `output_type`. Each
variant instructs the model to perform a specific role:

- **`code`**: Senior frontend engineer producing accurate,
  production-quality interfaces.
- **`prompt`**: Expert in reverse-engineering UIs and writing precise
  generation prompts.
- **`spec`**: Design-systems architect documenting interfaces for
  implementation teams.
- **`description`**: UX writer and interface analyst explaining visuals
  for someone who cannot see them.

Each prompt defines a structured response format with dedicated sections
appropriate to the artifact type.

### Output

Returns a `CallToolResult` with a single text content item containing
the generated artifact. See [Output Format](#output-format) for success
and error structures.

---

## `extract_text_from_screenshot`

### Purpose

Extracts and recognizes text from screenshots using OCR, optimized for
source code, terminal output, configuration files, documentation, and
general prose.

### When to Use

The user has a screenshot containing text and wants that text extracted.
The tool preserves code formatting (indentation, punctuation, operators,
quotes) and honors an optional programming-language hint.

### Do NOT Use For

UI design conversion, error diagnosis, or diagram understanding.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | Screenshot to extract text from: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | Instructions for text extraction. Specify what kind of text to extract and any formatting requirements. |
| `programming_language` | string | Optional | Programming-language hint when the screenshot contains code (e.g. `python`, `javascript`, `java`). Improves code recognition. Omit for non-code text. |

#### `programming_language`

When provided, this value is injected into the user message as:

```text
<prompt>

<language_hint>The code is in <programming_language>.</language_hint>
```

This helps the model correctly tokenize keywords, operators, and syntax
for the given language. Leave it empty or omit the parameter when the
screenshot contains prose, terminal output without code, configuration
in a non-programming format, or documentation.

`prompt` directs what the model should extract. For example:

- `"Extract only the code block in the center of the image"` — narrow
  focus.
- `"Transcribe all visible text including terminal prompts and
  timestamps"` — broad capture.
- `"Extract the YAML configuration and preserve its indentation"` —
  format-aware.

### System Prompt

The model is instructed as a text-extraction specialist. It is told to
preserve indentation, punctuation, and bracket matching for code; prompt
prefixes, timestamps, log levels, and alignment for terminals; hierarchy
and syntax for structured formats; and headings, lists, emphasis, and
reading order for prose. It must never invent obscured or illegible
content and must mark uncertainty explicitly.

The expected response sections are: **Extracted Text** (verbatim in code
blocks), **Content Type**, **Language or Format**, **OCR Corrections**,
and **Quality Notes**.

### Output

Returns a `CallToolResult` with a single text content item containing
the transcribed text and metadata. See [Output Format](#output-format)
for success and error structures.

---

## `diagnose_error_screenshot`

### Purpose

Diagnoses and analyzes error messages, stack traces, and exception
screenshots. Identifies the likely root cause and suggests corrective
and preventive action.

### When to Use

The user has an error screenshot and needs help understanding or fixing
it.

### Do NOT Use For

Code/UI extraction, general image analysis, or diagram understanding.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | Error screenshot to diagnose: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | What you want to know about this error and what help you need; include relevant context about when it occurred. |
| `context` | string | Optional | Additional context about when the error occurred (e.g. `during npm install`, `when running the app`, `after deployment`). Improves diagnosis accuracy. |

#### `context`

When provided, this value is injected into the user message as:

```text
<prompt>

<error_context>This error occurred <context>.</error_context>
```

This gives the model situational awareness — e.g. whether the error
happened during installation, at startup, during runtime, or after a
deployment. Leave it empty or omit the parameter when context is already
included in `prompt` or is unknown.

`prompt` should describe what the user wants to know. Examples:

- `"What caused this error and how do I fix it?"`
- `"Is this a dependency version conflict? The app worked yesterday."`
- `"Explain this stack trace; I don't understand the root cause."`

### System Prompt

The model is instructed as an experienced software engineer and
debugger. It must capture the exact error class, message, file/line
information, stack frames, commands, warnings, and visible code. It is
told to infer language, framework, runtime, and environment only from
supported clues; to trace the stack rather than assuming the immediate
failure location is the root cause; to consider cascading errors,
dependency/configuration issues, and version differences; and to offer
both an immediate remedy and a durable long-term fix.

The expected response sections are: **Error Summary**, **Root Cause
Analysis**, **Solution** (prioritized steps with concrete examples),
**Prevention**, and **Additional Notes**.

### Output

Returns a `CallToolResult` with a single text content item containing
the diagnosis. See [Output Format](#output-format) for success and error
structures.

---

## `understand_technical_diagram`

### Purpose

Analyzes and explains technical diagrams including architecture
diagrams, flowcharts, UML diagrams, entity-relationship diagrams,
sequence diagrams, and other system-design visuals.

### When to Use

The user has a technical diagram and wants to understand its structure,
components, data flow, or implications.

### Do NOT Use For

UI screenshots, error messages, or data visualizations/charts.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | Technical diagram to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | What you want to understand or extract from this diagram. |
| `diagram_type` | string | Optional | Known diagram type (e.g. `architecture`, `flowchart`, `uml`, `er-diagram`, `sequence`). Omit for auto-detection. |

#### `diagram_type`

When provided, this value is injected into the user message as:

```text
<prompt>

<diagram_type_hint>This is a <diagram_type> diagram.</diagram_type_hint>
```

This primes the model to interpret the notation correctly (e.g. UML
class boxes vs. ER entity rectangles). Omit or leave empty to let the
model auto-detect the diagram type from visual clues.

`prompt` can target specific aspects of the diagram. Examples:

- `"Explain the data flow from the client through to the database."`
- `"What does this architecture's failure model look like?"`
- `"List all entities and their relationships."`

### System Prompt

The model is instructed as a software architect and systems analyst. It
must identify the diagram type and notation; inventory components and
infer their responsibilities; follow arrows, cardinality, connection
labels, data flow, and control flow; recognize architectural patterns
and non-functional concerns (availability, scalability, caching,
security, observability, operations); explain entities, attributes, and
relationships for data models; and trace important workflow paths step
by step.

The expected response sections are: **Diagram Overview**, **Components**,
**Relationships and Data Flow**, **Architecture Analysis**, and
**Textual Representation** (Markdown outline, Mermaid, PlantUML, or
ASCII when useful).

### Output

Returns a `CallToolResult` with a single text content item containing
the diagram analysis. See [Output Format](#output-format) for success
and error structures.

---

## `ui_diff_check`

### Purpose

Compares an expected/reference UI screenshot with an actual
implementation to identify visual and implementation discrepancies for
design-to-build verification.

### When to Use

The user wants to compare an expected/reference UI design with an actual
implementation to find differences.

### Do NOT Use For

General image comparison, error diagnosis, or analyzing a single UI.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `expected_image_source` | string | **Required** | Expected/reference UI design image: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `actual_image_source` | string | **Required** | Actual/current implementation image: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | Instructions for the comparison. Specify which aspects to focus on and what level of detail is needed. |

#### Image Ordering

Both images are sent to the provider in a single Chat Completions
request as two image parts:

- **First image**: The expected/reference target.
- **Second image**: The actual/current implementation.

Both images are loaded and validated concurrently. If either image fails
to load or validate, the request aborts immediately — neither image is
sent to the provider — and an error is returned.

#### `prompt`

Directs the comparison focus. Examples:

- `"Check for spacing and alignment issues between the two screens."`
- `"Compare colors, typography, and control states."`
- `"Find all visual differences; I need a complete audit."`

### System Prompt

The model is instructed as a senior frontend QA engineer specializing in
visual regression. It must compare the first image (expected) with the
second (actual), inspecting top to bottom and by component: presence,
order, position, alignment, dimensions, spacing, layout, colors,
typography, borders, radii, shadows, imagery, icons, controls, states,
and text. Each issue is classified as CRITICAL, HIGH, MEDIUM, or LOW.

The expected response sections are: **Overall Assessment** (including
estimated match percentage), **Detailed Differences**, **Layout Issues**,
**Content Issues**, **Styling Issues**, **Recommended Fixes** (with CSS
examples where appropriate), and **Testing Notes**.

### Output

Returns a `CallToolResult` with a single text content item containing
the diff analysis. See [Output Format](#output-format) for success and
error structures.

---

## `analyze_data_visualization`

### Purpose

Analyzes data visualizations, charts, graphs, and dashboards to extract
metrics, trends, patterns, anomalies, and actionable insights.

### When to Use

The user has a data-visualization image and wants to understand the
underlying data, extract metrics, or get insights from it.

### Do NOT Use For

UI mockups, error screenshots, or technical architecture diagrams.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `image_source` | string | **Required** | Data visualization to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | string | **Required** | What insights or information you want to extract from this visualization. |
| `analysis_focus` | string | Optional | What to focus the analysis on (e.g. `trends`, `anomalies`, `comparisons`, `performance metrics`). Omit for comprehensive analysis. |

#### `analysis_focus`

When provided, this value is injected into the user message as:

```
<prompt>

<analysis_focus>Focus particularly on: <analysis_focus>.</analysis_focus>
```

This narrows the model's attention without overriding the tool's overall
analysis framework. Common values:

- `trends` — direction, rate of change, cycles, seasonality.
- `anomalies` — spikes, drops, outliers, unexpected patterns.
- `comparisons` — category performance, disparities, trade-offs.
- `performance metrics` — KPI values vs. targets, thresholds.

Omit or leave empty for comprehensive analysis covering all aspects.

`prompt` defines the analysis goal. Examples:

- `"What story does this chart tell about quarterly revenue?"`
- `"Identify all anomalies in this dashboard."`
- `"Compare the three product lines shown here."`

### System Prompt

The model is instructed as a data analyst specializing in extracting
decisions from charts, graphs, and dashboards. It must identify the
visualization type, subject, period, categories, axes, units, legends,
annotations, and data sources; extract important values (current,
starting, min, max, typical, comparative); describe direction, rate of
change, cycles, seasonality, disparities, correlations, and trade-offs;
and separate measured facts from hypotheses about causes.

The expected response sections are: **Visualization Summary**, **Key
Metrics** (with uncertainty noted where values cannot be read exactly),
**Trends and Patterns**, **Anomalies and Insights**, and **Actionable
Recommendations** (prioritized actions tied to evidence).

### Output

Returns a `CallToolResult` with a single text content item containing
the data analysis. See [Output Format](#output-format) for success and
error structures.
