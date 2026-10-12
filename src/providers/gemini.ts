import * as fs from 'node:fs';
import { ApiError, createPartFromUri, FileState, GoogleGenAI, type ContentListUnion, type Part } from '@google/genai';
import { ProviderError } from '../errors.js';
import type { Attachment } from '../types.js';
import { MB, type Capabilities, type GenerateRequest, type Provider } from './provider.js';

/** Above this, upload through the Files API instead of inlining base64 in the request. */
const INLINE_LIMIT_BYTES = 10 * MB;
const FILE_POLL_INTERVAL_MS = 2000;
const FILE_POLL_MAX_WAIT_MS = 5 * 60_000;

export class GeminiProvider implements Provider {
  readonly id = 'gemini';
  readonly capabilities: Capabilities = { image: 100 * MB, video: 2048 * MB, pdf: 100 * MB };
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.ai = new GoogleGenAI({ apiKey, ...(baseUrl && { httpOptions: { baseUrl } }) });
  }

  async generate({ model, prompt, attachment }: GenerateRequest): Promise<string> {
    let uploadedName: string | undefined;

    try {
      let contents: ContentListUnion = prompt;
      if (attachment) {
        const { part, uploaded } = await this.attachmentPart(attachment);
        uploadedName = uploaded;
        contents = [{ text: prompt }, part];
      }

      const response = await this.ai.models.generateContent({ model, contents });
      if (!response.text?.trim()) {
        throw new ProviderError('empty response (possibly blocked by safety filters)', 'unknown');
      }
      return response.text;
    } catch (error) {
      throw toProviderError(error);
    } finally {
      if (uploadedName) await this.ai.files.delete({ name: uploadedName }).catch(() => undefined);
    }
  }

  private async attachmentPart(attachment: Attachment): Promise<{ part: Part; uploaded?: string }> {
    if (attachment.sizeBytes <= INLINE_LIMIT_BYTES) {
      const data = fs.readFileSync(attachment.path).toString('base64');
      return { part: { inlineData: { data, mimeType: attachment.mimeType } } };
    }

    console.log(`   ⬆️  Uploading ${(attachment.sizeBytes / MB).toFixed(1)} MB via Gemini Files API...`);
    let file = await this.ai.files.upload({ file: attachment.path, config: { mimeType: attachment.mimeType } });

    const deadline = Date.now() + FILE_POLL_MAX_WAIT_MS;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) throw new ProviderError('timed out waiting for Gemini to process the upload', 'network');
      await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
      file = await this.ai.files.get({ name: file.name! });
    }
    if (file.state === FileState.FAILED || !file.uri) {
      throw new ProviderError('Gemini failed to process the uploaded file', 'bad_request');
    }

    return { part: createPartFromUri(file.uri, file.mimeType ?? attachment.mimeType), uploaded: file.name };
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ApiError) {
    return ProviderError.fromHttp(error.status, error.message, parseRetryDelay(error.message));
  }
  return ProviderError.fromThrown(error);
}

/** Gemini 429s carry a hint like `"retryDelay": "37s"` (sometimes with escaped quotes) in the message. */
function parseRetryDelay(message: string): number | undefined {
  const match = message.match(/retryDelay\\?"\s*:\s*\\?"(\d+(?:\.\d+)?)s/);
  return match ? Number(match[1]) * 1000 : undefined;
}
