/** The query types from the routing diagram. */
export type Kind = 'text' | 'docs' | 'image' | 'video';
export const KINDS: readonly Kind[] = ['text', 'docs', 'image', 'video'];

export interface Attachment {
  path: string;
  mimeType: string;
  sizeBytes: number;
}

/** A classified query, ready to be routed to a model. */
export interface Input {
  kind: Kind;
  /** File name, or "text query". */
  label: string;
  mimeType: string;
  prompt: string;
  attachment?: Attachment;
}

/** One model on one provider, e.g. { provider: "gemini", model: "gemini-3.8-flash" }. */
export interface Candidate {
  provider: string;
  model: string;
}

export type Routing = Record<Kind, Candidate[]>;
