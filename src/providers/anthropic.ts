import * as fs from 'node:fs';
import { ProviderError } from '../errors.js';
import { mediaTypeOf } from '../mime.js';
import { postJson } from './http.js';
import { MB, type Capabilities, type GenerateRequest, type Provider } from './provider.js';

const API_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 4096;

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  readonly capabilities: Capabilities = { image: 5 * MB, pdf: 30 * MB };
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = 'https://api.anthropic.com/v1',
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async generate({ model, prompt, attachment }: GenerateRequest): Promise<string> {
    const content: unknown[] = [];

    if (attachment) {
      const data = fs.readFileSync(attachment.path).toString('base64');
      const source = { type: 'base64', media_type: attachment.mimeType, data };
      content.push(mediaTypeOf(attachment.mimeType) === 'pdf' ? { type: 'document', source } : { type: 'image', source });
    }
    content.push({ type: 'text', text: prompt });

    const response = await postJson(
      `${this.baseUrl}/messages`,
      { 'x-api-key': this.apiKey, 'anthropic-version': API_VERSION },
      { model, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: 'user', content }] },
    );

    const text = (response?.content ?? [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('');

    if (!text.trim()) throw new ProviderError('empty response', 'unknown');
    return text;
  }
}
