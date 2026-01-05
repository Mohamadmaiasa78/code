
export type Language = 'python' | 'java' | 'javascript' | 'typescript' | 'cpp' | 'go' | 'rust' | 'php' | 'html' | 'css';

export type FileStatus = 'idle' | 'analyzing' | 'processing' | 'completed' | 'error';

export interface ConversionReport {
  timestamp: string;
  detectedProjectType: string;
  languagesFound: string[];
  totalFiles: number;
  convertedFiles: number;
  splitsFound: number;
  mergesFound: number;
  manualReviewRequired: string[];
  notes: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  outputFiles: Array<{ name: string; content: string; path: string }>;
  status: FileStatus;
  error?: string;
  isAsset?: boolean;
  originalFile?: File; // To support unchanged binary copying
}

export interface ProjectAnalysis {
  projectType: string;
  primaryLanguage: Language;
  framework?: string;
  ambiguousFiles: string[];
  suggestedTarget: Language;
}

export interface ConversionJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  report?: ConversionReport;
}

export interface ConversionHistoryItem {
  id: string;
  fileId: string;
  fileName: string;
  filePath: string;
  timestamp: string;
  sourceLang: string;
  targetLang: string;
  originalContent: string;
  outputFiles: Array<{ name: string; content: string; path: string }>;
}
