
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectFile, ProjectAnalysis, Language } from "../types";

export class GeminiConversionService {
  private getAI() {
    // Strictly adhering to the required environment variable 'API_KEY'
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                      text.match(/```\n([\s\S]*?)\n```/) ||
                      [null, text];
    return (jsonMatch[1] || text).trim();
  }

  async analyzeProject(files: ProjectFile[]): Promise<ProjectAnalysis> {
    try {
      const ai = this.getAI();
      const fileManifest = files.map(f => ({ name: f.name, path: f.path, size: f.content.length }));
      
      const prompt = `
        Analyze this project structure and file manifest:
        ${JSON.stringify(fileManifest, null, 2)}
        
        Determine the project type (e.g., Maven, Node.js, WordPress Plugin, Static HTML), primary languages, 
        frameworks detected, and any ambiguous files. Suggest a logical target language for conversion.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectType: { type: Type.STRING },
              primaryLanguage: { type: Type.STRING },
              framework: { type: Type.STRING },
              ambiguousFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestedTarget: { type: Type.STRING }
            },
            required: ["projectType", "primaryLanguage", "suggestedTarget"]
          }
        }
      });

      const cleanedJson = this.cleanJsonResponse(response.text || '{}');
      return JSON.parse(cleanedJson) as ProjectAnalysis;
    } catch (error) {
      console.error("Gemini Project Analysis Error:", error);
      throw new Error("Failed to analyze project structure. Please check your network connection or API key.");
    }
  }

  async convertFileWithSplitting(
    file: ProjectFile, 
    sourceLang: Language, 
    targetLang: Language, 
    autoSplit: boolean,
    systemInstruction?: string
  ): Promise<Array<{ name: string; content: string; path: string }>> {
    try {
      const ai = this.getAI();
      
      const prompt = `
        Transpile the following code from ${sourceLang} to ${targetLang}.
        
        FILE PATH: ${file.path}
        CODE:
        \`\`\`${sourceLang}
        ${file.content}
        \`\`\`
        
        ${autoSplit ? `
        IMPORTANT: If the target language patterns suggest splitting this file into multiple components 
        (e.g., one Python file with multiple classes into separate Java files, or one large HTML file into header/footer/content PHP templates), 
        please provide the output as a set of separate files. 
        ` : 'Maintain a 1:1 file mapping. If unresolved, mark with TODO comments.'}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "You are a world-class code migration tool. Preserve logic perfectly. Output results in a strictly valid JSON array of files.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              files: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "New filename" },
                    path: { type: Type.STRING, description: "Relative path in project" },
                    content: { type: Type.STRING, description: "Transpiled code" }
                  },
                  required: ["name", "path", "content"]
                }
              }
            },
            required: ["files"]
          }
        }
      });

      const cleanedJson = this.cleanJsonResponse(response.text || '{"files": []}');
      const result = JSON.parse(cleanedJson);
      return result.files || [];
    } catch (error) {
      console.error(`Gemini Conversion Error for file ${file.name}:`, error);
      throw new Error(`Failed to convert ${file.name}. The AI model may be overloaded or the file contains unsupported constructs.`);
    }
  }
}

export const conversionService = new GeminiConversionService();
