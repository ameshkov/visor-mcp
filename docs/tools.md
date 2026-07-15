# Tools

The server exposes seven tools for image analysis. Each tool accepts one
or more image sources and a prompt, and returns a text response from the
configured vision provider.

## Tool Overview

| Tool | Purpose | Fields |
| --- | --- | --- |
| `ui_diff_check` | Compare an expected UI screenshot with an actual implementation to find visual discrepancies. | `expected_image_source`, `actual_image_source`, `prompt` |
| `ui_to_artifact` | Convert a UI screenshot into frontend code, an AI recreation prompt, a design specification, or a natural-language description. | `image_source`, `output_type` (one of `code`, `prompt`, `spec`, `description`), `prompt` |
| `extract_text_from_screenshot` | Transcribe text from screenshots of source code, terminal output, configuration, or prose. | `image_source`, `prompt`, `programming_language` (optional) |
| `diagnose_error_screenshot` | Analyze a screenshot containing an error, exception, or stack trace for diagnosis. | `image_source`, `prompt`, `context` (optional) |
| `understand_technical_diagram` | Explain architecture diagrams, flowcharts, UML, entity-relationship, and sequence diagrams. | `image_source`, `prompt`, `diagram_type` (optional) |
| `analyze_image` | General-purpose image analysis; the fallback for requests not covered by a specialized tool. | `image_source`, `prompt` |
| `analyze_data_visualization` | Analyze charts, graphs, and dashboards for metrics, patterns, and insights. | `image_source`, `prompt`, `analysis_focus` (optional) |

All required and optional string fields must be non-whitespace. Unknown
fields are accepted (stripped).

## Image Sources & Formats

### Accepted Sources

- Base64 `data:` URL
- Absolute local file path
- HTTP/HTTPS URL

Rejected without conversion: `ftp:`, `file:`, relative paths, and
non-`base64` data URLs.

### Accepted Formats

Detected from image bytes (not from file extension or MIME header):

- PNG
- JPEG
- WebP
- Static GIF

Rejected without conversion: SVG, animated GIF, malformed bytes, and
content whose declared type or extension conflicts with its detected
bytes.

### Size Limit

5 MB per image by default, configurable via
`VISOR_MCP_MAX_IMAGE_SIZE_MB`. The limit applies uniformly to local
files, remote responses, and data URLs — reading, decoding, or
downloading stops immediately when the limit is exceeded.

### HTTP Downloads

Unauthenticated `GET`, at most 5 redirects. Redirects may switch between
HTTP and HTTPS but not to another scheme. Credentials and fragments are
stripped before fetch; query values are redacted from diagnostics.

---

## Tool Reference

### `analyze_image`

General-purpose image analysis for scenarios not covered by a
specialized tool. Use this as a fallback when none of the specialized
tools fit the user's need.

**Do NOT use for:** tasks that match one of the specialized tools.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | Image to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | What to analyze, extract, or understand from the image. Be specific about your requirements. |

### `ui_to_artifact`

Converts a UI screenshot into frontend code, an AI recreation prompt, a
design specification, or a natural-language description, selected via
`output_type`.

**Use this tool ONLY when the user wants to:**
- Generate frontend code from a UI design (`output_type='code'`)
- Create an AI prompt that recreates the UI (`output_type='prompt'`)
- Extract a design specification document (`output_type='spec'`)
- Get a natural-language description of the UI (`output_type='description'`)

**Do NOT use for:** OCR/text extraction, error diagnosis, technical
diagrams, or data visualizations.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | UI screenshot to convert: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `output_type` | yes | Type of artifact to generate: `code`, `prompt`, `spec`, or `description`. |
| `prompt` | yes | Detailed instructions for the conversion. State the desired output and any specific requirements. |

### `extract_text_from_screenshot`

Extracts and recognizes text from screenshots using OCR, optimized for
source code, terminal output, configuration, documentation, and general
prose.

**Use this tool ONLY when** the user has a screenshot containing text
and wants that text extracted. It preserves code formatting and honors
an optional programming-language hint.

**Do NOT use for:** UI design conversion, error diagnosis, or diagram
understanding.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | Screenshot to extract text from: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | Instructions for text extraction. Specify what kind of text to extract and any formatting requirements. |
| `programming_language` | no | Programming-language hint when the screenshot contains code (e.g. `python`, `javascript`, `java`). Improves code recognition; omit for non-code text. |

### `diagnose_error_screenshot`

Diagnoses and analyzes error messages, stack traces, and exception
screenshots: identifies the likely root cause and suggests corrective
and preventive action.

**Use this tool ONLY when** the user has an error screenshot and needs
help understanding or fixing it.

**Do NOT use for:** code/UI extraction, general image analysis, or
diagram understanding.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | Error screenshot to diagnose: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | What you want to know about this error and what help you need; include relevant context about when it occurred. |
| `context` | no | Context about when the error occurred (e.g. `during npm install`, `when running the app`, `after deployment`). Improves diagnosis accuracy. |

### `understand_technical_diagram`

Analyzes and explains technical diagrams including architecture
diagrams, flowcharts, UML, entity-relationship diagrams, sequence
diagrams, and other system-design visuals.

**Use this tool ONLY when** the user has a technical diagram and wants
to understand its structure, components, or data flow.

**Do NOT use for:** UI screenshots, error messages, or data
visualizations/charts.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | Technical diagram to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | What you want to understand or extract from this diagram. |
| `diagram_type` | no | Known diagram type (e.g. `architecture`, `flowchart`, `uml`, `er-diagram`, `sequence`). Omit for auto-detection. |

### `ui_diff_check`

Compares an expected/reference UI screenshot with an actual
implementation to identify visual and implementation discrepancies for
design-to-build verification.

**Use this tool ONLY when** the user wants to compare an
expected/reference UI with an actual implementation.

**Do NOT use for:** general image comparison, error diagnosis, or
analyzing a single UI.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `expected_image_source` | yes | Expected/reference UI design image: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `actual_image_source` | yes | Actual/current implementation image: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | Instructions for the comparison. Specify which aspects to focus on and what level of detail is needed. |

Both images are validated before any provider call — an invalid expected
or actual source aborts atomically.

### `analyze_data_visualization`

Analyzes data visualizations, charts, graphs, and dashboards to extract
metrics, trends, patterns, anomalies, and actionable insights.

**Use this tool ONLY when** the user has a data-visualization image and
wants to understand the underlying data.

**Do NOT use for:** UI mockups, error screenshots, or technical
architecture diagrams.

**Parameters:**

| Parameter | Required | Description |
| --- | --- | --- |
| `image_source` | yes | Data visualization to analyze: a data URL, an HTTP/HTTPS URL, or an absolute file path. |
| `prompt` | yes | What insights or information you want to extract from this visualization. |
| `analysis_focus` | no | What to focus on (e.g. `trends`, `anomalies`, `comparisons`, `performance metrics`). Omit for comprehensive analysis. |

### Optional Hints

The optional fields (`programming_language`, `context`, `diagram_type`,
`analysis_focus`) are free-text hints. When supplied, they inform the
analysis without overriding the tool's built-in purpose.
