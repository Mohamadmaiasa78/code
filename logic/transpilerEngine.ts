
import { conversionService } from "../services/geminiService";
import { ProjectFile, ProjectAnalysis, Language } from "../types";

/**
 * PRODUCTION PIPELINE ENGINE
 * 
 * Handles project-level orchestration for the transpilation workspace.
 */

export const analyzeProject = async (files: ProjectFile[]): Promise<ProjectAnalysis> => {
  if (files.length === 0) {
    throw new Error("No files provided for analysis");
  }
  return await conversionService.analyzeProject(files);
};

export const startConversionJob = async (
  files: ProjectFile[], 
  sourceLang: Language, 
  targetLang: Language,
  autoSplit: boolean
): Promise<{ jobId: string }> => {
  // In this serverless context, we treat the job ID as a timestamp-based session ID
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Note: Actual conversion logic is handled in the UI loop via convertFileWithSplitting
  // for real-time progress updates and granular error handling.
  return { jobId };
};

/**
 * Utility for handling specific framework conversions like WordPress or Static HTML.
 */
export const frameworkAdapter = {
  detectFramework: (files: ProjectFile[]): string | undefined => {
    if (files.some(f => f.name === 'wp-config.php' || f.name.includes('wp-content'))) return 'WordPress';
    if (files.some(f => f.name === 'package.json')) return 'Node.js';
    if (files.some(f => f.name === 'pom.xml')) return 'Maven';
    return undefined;
  }
};
