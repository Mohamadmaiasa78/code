import { GoogleGenAI, Type } from "@google/genai";
import { ProjectFile, ProjectAnalysis, Language } from "../types";

export class GeminiConversionService {
  private getAI() {
    // Gebruikt de API_KEY die via vite.config.ts is gedefinieerd
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key niet gevonden. Zorg ervoor dat GEMINI_API_KEY in je .env.local staat.");
    }
    return new GoogleGenAI({ apiKey });
  }

  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();
    const jsonMatch = cleaned.match(/^(?:```json|```)?\s*([\s\S]*?)\s*(?:```)?$/);
    if (jsonMatch && jsonMatch[1]) {
      cleaned = jsonMatch[1].trim();
    }
    return cleaned;
  }

  async analyzeProject(files: ProjectFile[]): Promise<ProjectAnalysis> {
    try {
      const ai = this.getAI();
      const fileManifest = files.map(f => ({ 
        name: f.name, 
        path: f.path, 
        size: f.content.length,
        isAsset: f.isAsset 
      }));
      
      const prompt = `
        Analyze this project structure and file manifest:
        ${JSON.stringify(fileManifest, null, 2)}
        
        1. Determine project type (React/Vite/Next.js, Spring Boot/Maven, WordPress, etc.).
        2. Identify if it is mixed (frontend and backend).
        3. Identify primary languages and frameworks.
        4. Suggest target conversion path based on user requested target.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash', // GEWIJZIGD: Gebruik 1.5 Flash voor snelle analyse
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
      throw new Error("Projectanalyse mislukt.");
    }
  }

  async convertFileWithSplitting(
    file: ProjectFile, 
    sourceLang: Language, 
    targetLang: Language, 
    autoSplit: boolean
  ): Promise<Array<{ name: string; content: string; path: string }>> {
    try {
      const ai = this.getAI();
      
      const prompt = `
        Transpile from ${sourceLang} to ${targetLang}.
        
        FILE PATH: ${file.path}
        CODE:
        \`\`\`${sourceLang}
        ${file.content}
        \`\`\`

        TARGET REQUIREMENTS:
        - If converting to Spring Boot:
            * Create src/main/java/.../Application.java, controllers/, models/, etc.
            * For frontend files, they must be preserved and put ONLY in src/main/resources/static/.
            * NEVER convert React components to Java classes.
        - FOLDERS: Maintain original structure unless idiomatic target structure dictates otherwise (e.g., Java package folders).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro', // GEWIJZIGD: Gebruik 1.5 Pro voor nauwkeurige transpilatie
        contents: prompt,
        config: {
          systemInstruction: `You are a codebase conversion engine. FOLLOW RULES STRICTLY:
1. NEVER transpile config files (package.json, tsconfig.json, vite.config.ts, webpack.config.js, pom.xml, composer.json, manifest.json, .env, .gitignore).
2. NEVER convert React components into Java classes.
3. NEVER rewrite frontend build tools into backend code.
4. If converting to Spring Boot: Place frontend files ONLY inside src/main/resources/static/.
5. Create clean project structure for backend: Application.java, controllers/, resources/static/.
6. Use idiomatic patterns of the target language.
7. Do not mix frontend and backend responsibilities.
8. Output MUST be a valid JSON object with a "files" array containing name, path, and content.`,
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

      const cleanedJson = this.cleanJsonResponse(response.text || '{"files": []}');
      const result = JSON.parse(cleanedJson);
      return result.files || [];
    } catch (error) {
      console.error(`Gemini Conversion Error for ${file.name}:`, error);
      throw new Error(`Conversie mislukt voor ${file.name}.`);
    }
  }
}

export const conversionService = new GeminiConversionService();