import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import { IAgent } from './baseAgent';

export class ImageAgent implements IAgent {
  public name = "Image Processing Agent (Gemini Vision Multimodal)";
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async process(filePath: string, mimeType: string): Promise<string> {
    console.log(`\n⏳ [AI Tool Access] Accessing tool: "${this.name}" for visual inspection & OCR...`);
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { text: "Analyze this image in detail. Extract any visible text, describe visual subjects, and provide insights." },
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
