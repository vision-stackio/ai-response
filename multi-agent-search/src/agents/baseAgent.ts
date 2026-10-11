export interface IAgent {
  name: string;
  process(filePath: string, mimeType: string): Promise<string>;
}
