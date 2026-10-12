import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import { IAgent } from './baseAgent';

export class VideoAgent implements IAgent {
  public name = "Video Processing Agent (Gemini Multimodal Video Analyzer)";
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async process(filePath: string, mimeType: string): Promise<string> {
    console.log(`\n⏳ [AI Tool Access] Accessing tool: "${this.name}" for frame-by-frame and audio analysis...`);
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { text: "Provide a comprehensive scene-by-scene analysis and summary of this video file." },
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ],
    });

    return response.text || "No response generated.";
  }
}
