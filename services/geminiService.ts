import { GoogleGenAI, Type } from "@google/genai";
import { ProjectFile, ProjectAnalysis, Language } from "../types";

export class GeminiConversionService {
  private getAI() {
    // Robust access to the API key. In Vite, process.env.API_KEY is replaced by the defined string.
    // We access it directly to ensure the bundler replacement kicks in.
    const apiKey = process.env.API_KEY;
    
    if (!apiKey || apiKey.includes("API_KEY")) {
      throw new Error("GEMINI_API_KEY is not configured. Please check your .env file or environment variables.");
    }
    return new GoogleGenAI({ apiKey });
  }

  private cleanJson(text: string): string {
    return text.replace(/```json|```/g, "").trim();
  }

  async analyzeProject(files: ProjectFile[]): Promise<ProjectAnalysis> {
    const ai = this.getAI();
    const manifest = files.slice(0, 50).map(f => ({ path: f.path, name: f.name }));
    
    // Using gemini-2.0-flash-exp for reliable high-speed analysis
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Analyze this codebase structure: ${JSON.stringify(manifest)}. Identify the project type and primary programming language.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectType: { type: Type.STRING },
            primaryLanguage: { type: Type.STRING },
            suggestedTarget: { type: Type.STRING }
          },
          required: ["projectType", "primaryLanguage", "suggestedTarget"]
        }
      }
    });

    return JSON.parse(this.cleanJson(response.text));
  }

  async convertFile(file: ProjectFile, from: string, to: string): Promise<Array<{ name: string; content: string; path: string }>> {
    const ai = this.getAI();
    
    // Using gemini-2.0-pro-exp-02-05 for complex logic reasoning
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-pro-exp-02-05',
      contents: `Convert ${file.path} from ${from} to ${to}.\n\nCode:\n${file.content}`,
      config: {
        systemInstruction: "You are a senior software architect. Convert code while preserving directory structure and architectural patterns. NEVER convert package managers or lockfiles.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  path: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["name", "path", "content"]
              }
            }
          },
          required: ["files"]
        }
      }
    });

    const result = JSON.parse(this.cleanJson(response.text));
    return result.files;
  }
}

export const conversionService = new GeminiConversionService();