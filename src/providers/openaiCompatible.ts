import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProviderError } from '../errors.js';
import { mediaTypeOf } from '../mime.js';
import type { Attachment } from '../types.js';
import { postJson } from './http.js';
import type { Capabilities, GenerateRequest, Provider } from './provider.js';

export interface OpenAICompatibleOptions {
  id: string;
  baseUrl: string;
  apiKey?: string;
  capabilities: Capabilities;
}

/**
 * Talks the OpenAI "chat completions" protocol. Used for OpenAI itself, xAI (Grok),
 * and any custom provider that speaks the same protocol (Groq, OpenRouter, Ollama, ...).
 */
export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly capabilities: Capabilities;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: OpenAICompatibleOptions) {
    this.id = options.id;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.headers = options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {};
  }

  async generate({ model, prompt, attachment }: GenerateRequest): Promise<string> {
    const content = attachment ? [{ type: 'text', text: prompt }, attachmentPart(attachment)] : prompt;

    const data = await postJson(`${this.baseUrl}/chat/completions`, this.headers, {
      model,
      messages: [{ role: 'user', content }],
    });

    // Some gateways (OpenRouter) report upstream failures as HTTP 200 with an `error` object.
    if (data?.error) {
      const status = Number(data.error.code) || 502;
      throw ProviderError.fromHttp(status, JSON.stringify({ error: data.error }));
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError('empty response', 'unknown');
    return text;
  }
}

function attachmentPart(attachment: Attachment) {
  const base64 = fs.readFileSync(attachment.path).toString('base64');
  const dataUrl = `data:${attachment.mimeType};base64,${base64}`;

  return mediaTypeOf(attachment.mimeType) === 'pdf'
    ? { type: 'file', file: { filename: path.basename(attachment.path), file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } };
}
