export type Language = 'python' | 'java' | 'javascript' | 'typescript' | 'cpp' | 'go' | 'rust' | 'php' | 'html' | 'css';

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  outputFiles: Array<{ name: string; content: string; path: string }>;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
  isAsset?: boolean;
}

export interface ProjectAnalysis {
  projectType: string;
  primaryLanguage: Language;
  framework?: string;
  suggestedTarget: Language;
}

export interface ConversionHistoryItem {
  id: string;
  fileName: string;
  sourceLang: string;
  targetLang: string;
  timestamp: string;
  originalContent: string;
  outputFiles: Array<{ name: string; content: string; path: string }>;
}