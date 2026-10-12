import { mediaTypeOf, type MediaType } from '../mime.js';
import type { Attachment, Input } from '../types.js';

/** Max attachment size in bytes per media type. Missing key = not supported. */
export type Capabilities = Partial<Record<MediaType, number>>;

export interface GenerateRequest {
  model: string;
  prompt: string;
  attachment?: Attachment;
}

export interface Provider {
  readonly id: string;
  readonly capabilities: Capabilities;
  generate(request: GenerateRequest): Promise<string>;
}

export const MB = 1024 * 1024;

/** Returns null if the provider can take this input, otherwise the reason it can't. */
export function whyCannotHandle(provider: Provider, input: Input): string | null {
  if (!input.attachment) return null;

  const mediaType = mediaTypeOf(input.attachment.mimeType);
  if (!mediaType) return `unsupported attachment type ${input.attachment.mimeType}`;

  const maxBytes = provider.capabilities[mediaType];
  if (maxBytes === undefined) return `doesn't accept ${mediaType} input`;
  if (input.attachment.sizeBytes > maxBytes) {
    return `${mediaType} is ${(input.attachment.sizeBytes / MB).toFixed(1)} MB, limit is ${(maxBytes / MB).toFixed(0)} MB`;
  }
  return null;
}
