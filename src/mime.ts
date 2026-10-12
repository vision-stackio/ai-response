import * as path from 'node:path';

export const DEFAULT_MIME_TYPE = 'application/octet-stream';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.csv': 'text/plain',
  '.log': 'text/plain',
  '.html': 'text/plain',
  '.xml': 'text/plain',
  '.yaml': 'text/plain',
  '.yml': 'text/plain',
  '.json': 'application/json',
};

export function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? DEFAULT_MIME_TYPE;
}

export function hasKnownExtension(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() in MIME_TYPES;
}

/** Binary attachment categories that providers declare support for. */
export type MediaType = 'image' | 'video' | 'pdf';

export function mediaTypeOf(mimeType: string): MediaType | undefined {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return undefined;
}
