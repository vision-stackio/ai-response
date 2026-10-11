import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import { IAgent } from './baseAgent';

export class DocumentAgent implements IAgent {
  public name = "Text Document Agent (Gemini Flash Text)";
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async process(filePath: string, mimeType: string): Promise<string> {
    console.log(`\n⏳ [AI Tool Access] Accessing tool: "${this.name}" to process text document...`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Please review and provide a structured information summary of this document:\n\n${fileContent}`,
    });

    return response.text || "No response generated.";
  }
}
