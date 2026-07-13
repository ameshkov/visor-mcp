import type { ServerConfig } from '../../config/index.js';
import type { ValidatedImage } from '../images/index.js';

interface ProviderRequest {
  readonly systemPrompt: string;
  readonly userText: string;
  readonly images: readonly ValidatedImage[];
}

type ProviderResult = { ok: true; text: string } | { ok: false; error: string };

export function analyze(config: ServerConfig, request: ProviderRequest): Promise<ProviderResult> {
  return doRequest(config, request);
}

async function doRequest(config: ServerConfig, request: ProviderRequest): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetch(config.chatCompletionsEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(composeRequestBody(config, request)),
    });
  } catch {
    return { ok: false, error: 'provider request failed' };
  }
  if (!response.ok) {
    return { ok: false, error: 'provider request failed' };
  }
  // The provider may return 2xx with a non-JSON body (e.g. a misconfigured
  // proxy/gateway HTML page or a truncated response). response.json() throws a
  // SyntaxError in that case; catch it so `analyze` stays total (every failure
  // path returns a ProviderResult, never throws), the raw provider body never
  // leaks into the MCP error surface, and analyzeImageHandler's unwrapped
  // `await analyze(...)` cannot propagate a throw. Reuses the same curated
  // error string normalizeResponse emits for the no-usable-text case.
  try {
    return normalizeResponse(await response.json());
  } catch {
    return { ok: false, error: 'malformed provider response' };
  }
}

function composeRequestBody(
  config: ServerConfig,
  request: ProviderRequest,
): Record<string, unknown> {
  const imageParts = request.images.map((image) => ({
    type: 'image_url',
    image_url: { url: image.dataUrl },
  }));
  return {
    ...config.requestBodyExtras,
    model: config.model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: [...imageParts, { type: 'text', text: request.userText }] },
    ],
    stream: false,
  };
}

function normalizeResponse(json: unknown): ProviderResult {
  const text = firstChoiceText(json);
  if (text === null) {
    return { ok: false, error: 'malformed provider response' };
  }
  return { ok: true, text };
}

function firstChoiceText(json: unknown): string | null {
  if (!isObject(json)) return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown> | undefined)?.message;
  if (!isObject(message)) return null;
  const content = message.content;
  if (typeof content === 'string') return content.length > 0 ? content : null;
  if (Array.isArray(content)) {
    const texts = content
      .filter(isTextPart)
      .map((part) => (part as Record<string, unknown>).text as string);
    return texts.length > 0 ? texts.join('') : null;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTextPart(part: unknown): boolean {
  return isObject(part) && part.type === 'text' && typeof part.text === 'string';
}
