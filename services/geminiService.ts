
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectFile, ProjectAnalysis, Language } from "../types";

export class GeminiConversionService {
  /**
   * Initialiseert de Gemini API client.
   * Maakt gebruik van de verplichte process.env.API_KEY.
   */
  private getAI() {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      throw new Error(
        "CONFIGURATIEFOUT: De Gemini API-sleutel (process.env.API_KEY) is niet gevonden. " +
        "Zorg ervoor dat GEMINI_API_KEY aanwezig is in je .env.local bestand en dat deze " +
        "door je build-configuratie wordt doorgegeven als process.env.API_KEY."
      );
    }
    
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Helper om JSON antwoorden van het model te cleanen van markdown formatting.
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();
    const jsonMatch = cleaned.match(/^(?:```json|```)?\s*([\s\S]*?)\s*(?:```)?$/);
    if (jsonMatch && jsonMatch[1]) {
      cleaned = jsonMatch[1].trim();
    }
    return cleaned;
  }

  /**
   * Analyseert de projectstructuur met Gemini 3 Flash.
   */
  async analyzeProject(files: ProjectFile[]): Promise<ProjectAnalysis> {
    const ai = this.getAI();
    const fileManifest = files.map(f => ({ 
      name: f.name, 
      path: f.path, 
      size: f.content.length,
      isAsset: f.isAsset 
    }));
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyseer de volgende projectstructuur: ${JSON.stringify(fileManifest)}. Bepaal het projecttype en de primaire taal.`,
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

    const text = response.text;
    if (!text) throw new Error("Analyse mislukt: Geen antwoord van Gemini.");
    return JSON.parse(this.cleanJsonResponse(text)) as ProjectAnalysis;
  }

  /**
   * Converteert code met Gemini 3 Pro voor maximale nauwkeurigheid.
   */
  async convertFileWithSplitting(
    file: ProjectFile, 
    sourceLang: Language, 
    targetLang: Language, 
    autoSplit: boolean
  ): Promise<Array<{ name: string; content: string; path: string }>> {
    const ai = this.getAI();
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Transpileer van ${sourceLang} naar ${targetLang}. Pad: ${file.path}\n\nCode:\n${file.content}`,
      config: {
        systemInstruction: `Je bent een expert in codebase migraties.
STRICTE REGELS:
1. Converteer NOOIT configuratiebestanden (package.json, pom.xml, .env, etc.).
2. Behoud frontend code als frontend. Converteer React componenten NOOIT naar Java/backend code.
3. Bij conversie naar Spring Boot: Plaats backend in src/main/java en frontend in src/main/resources/static/.
4. Behoud de mappenstructuur of pas deze aan volgens de conventies van de doeltaal.`,
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

    const text = response.text;
    if (!text) throw new Error(`Conversie mislukt voor: ${file.name}`);
    const result = JSON.parse(this.cleanJsonResponse(text));
    return result.files || [];
  }
}

export const conversionService = new GeminiConversionService();
