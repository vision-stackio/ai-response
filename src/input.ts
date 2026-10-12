import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_MIME_TYPE, getMimeType, hasKnownExtension, mediaTypeOf } from './mime.js';
import type { Input } from './types.js';

/** Text up to this many characters counts as a "small" query and goes to the small-model route. */
export const SHORT_TEXT_MAX_CHARS = 2000;

export class UnsupportedInputError extends Error {}

const PROMPTS = {
  image: 'Analyze this image in detail. Extract any visible text, describe visual subjects, and provide insights.',
  video: 'Provide a comprehensive scene-by-scene analysis and summary of this video file.',
  pdf: 'Please review and provide a structured information summary of this document.',
  textFile: (content: string) =>
    `Please review and provide a structured information summary of this document:\n\n${content}`,
} as const;

/** Text typed straight into the CLI. */
export function fromText(query: string): Input {
  return {
    kind: query.length <= SHORT_TEXT_MAX_CHARS ? 'text' : 'docs',
    label: 'text query',
    mimeType: 'text/plain',
    prompt: query,
  };
}

/** A file on disk. Classified by type, and for text files by length. */
export function fromFile(filePath: string): Input {
  const label = path.basename(filePath);
  const mimeType = getMimeType(filePath);
  const sizeBytes = fs.statSync(filePath).size;
  const attachment = { path: filePath, mimeType, sizeBytes };

  switch (mediaTypeOf(mimeType)) {
    case 'image':
      return { kind: 'image', label, mimeType, prompt: PROMPTS.image, attachment };
    case 'video':
      return { kind: 'video', label, mimeType, prompt: PROMPTS.video, attachment };
    case 'pdf':
      return { kind: 'docs', label, mimeType, prompt: PROMPTS.pdf, attachment };
  }

  if (mimeType === DEFAULT_MIME_TYPE && looksBinary(filePath)) {
    throw new UnsupportedInputError(`${label}: unsupported file type (binary data).`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.trim()) throw new UnsupportedInputError(`${label}: file is empty.`);

  return {
    kind: content.length <= SHORT_TEXT_MAX_CHARS ? 'text' : 'docs',
    label,
    mimeType,
    prompt: PROMPTS.textFile(content),
  };
}

/** True when the argument is clearly meant as a file path (no spaces, known extension). */
export function looksLikeFilePath(arg: string): boolean {
  return !/\s/.test(arg) && hasKnownExtension(arg);
}

function looksBinary(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8000);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}
