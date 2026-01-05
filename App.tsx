
import React, { useState, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { conversionService } from './services/geminiService';
import { ProjectFile, Language, ProjectAnalysis, ConversionHistoryItem } from './types';
import { 
  Code2, Play, Sparkles, FolderOpen, FileCode, ChevronRight, 
  Loader2, Download, Folder, ChevronDown, Terminal, History, 
  Box, ShieldCheck, Zap, Layers, FileJson, CheckCircle2, AlertCircle
} from 'lucide-react';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'python', label: 'Python' }, { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' }, { id: 'typescript', label: 'TypeScript' },
  { id: 'rust', label: 'Rust' }, { id: 'go', label: 'Go' }, { id: 'php', label: 'PHP' }
];

const App: React.FC = () => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [targetLang, setTargetLang] = useState<Language>('java');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = useMemo(() => files.find(f => f.id === selectedFileId), [files, selectedFileId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const loadedFiles: ProjectFile[] = [];
    // Fix: Cast each item in FileList to File to ensure 'name' and other properties are accessible in strict mode
    const readers = Array.from(fileList).map((fileObj, idx) => {
      const file = fileObj as File;
      const path = (file as any).webkitRelativePath || file.name;
      if (path.includes('node_modules') || path.includes('.git')) return null;
      
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          loadedFiles.push({
            id: `f-${idx}-${Date.now()}`,
            name: file.name,
            path: path,
            content: ev.target?.result as string,
            outputFiles: [],
            status: 'idle',
            isAsset: !/\.(ts|js|py|java|cpp|php|go|rust|c|h|cs|html|css|json)$/i.test(file.name)
          });
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    setFiles(loadedFiles);
    setIsProcessing(true);
    try {
      const res = await conversionService.analyzeProject(loadedFiles);
      setAnalysis(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startConversion = async () => {
    setIsProcessing(true);
    setProgress(0);
    const zip = new JSZip();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.isAsset) {
        zip.file(file.path, file.content);
        continue;
      }

      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
      setSelectedFileId(file.id);

      try {
        const sourceLang = analysis?.primaryLanguage || 'javascript';
        const results = await conversionService.convertFile(file, sourceLang, targetLang);
        
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'completed', outputFiles: results } : f));
        results.forEach(rf => zip.file(rf.path, rf.content));
        
        setHistory(prev => [{
          id: `h-${Date.now()}`,
          fileName: file.name,
          sourceLang,
          targetLang,
          timestamp: new Date().toLocaleTimeString(),
          originalContent: file.content,
          outputFiles: results
        }, ...prev]);
      } catch (err) {
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: 'Transpilatie mislukt' } : f));
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_project_${targetLang}.zip`;
    a.click();
    setIsProcessing(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar: Explorer & Settings */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-white leading-none">PolyGlot</h1>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">AI Engine</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-all text-sm font-semibold"
            >
              <FolderOpen className="w-4 h-4" />
              Open Project
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} {...({ webkitdirectory: "", directory: "" } as any)} />
          </div>

          <div className="space-y-4">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Pipeline Config</h2>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block px-1">Target Language</label>
              <select 
                value={targetLang} 
                onChange={(e) => setTargetLang(e.target.value as Language)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              >
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Project Explorer</h2>
            <div className="bg-slate-950/50 rounded-lg border border-slate-800/50 overflow-hidden py-2">
              {files.map(file => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition-colors group ${
                    selectedFileId === file.id ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-500' : 'text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    file.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                    file.status === 'processing' ? 'bg-indigo-500 animate-pulse' :
                    file.status === 'error' ? 'bg-rose-500' : 'bg-slate-700'
                  }`} />
                  <span className="truncate flex-1">{file.name}</span>
                  {file.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                </button>
              ))}
              {files.length === 0 && <p className="text-[10px] text-slate-600 italic px-4 py-2">Geen bestanden geladen...</p>}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900/80 backdrop-blur-sm">
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase text-indigo-400">
                <span>Voortgang</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <button 
            onClick={startConversion}
            disabled={isProcessing || files.length === 0}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
            Transpile Project
          </button>
        </div>
      </aside>

      {/* Main View: Code Comparison */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0b0c0e]">
        <div className="h-14 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900/30">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Terminal className="w-4 h-4" />
              <span>Workspace</span>
            </div>
            {analysis && (
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">
                <Box className="w-3 h-3" />
                {analysis.projectType} • {analysis.primaryLanguage}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-bold text-emerald-400 uppercase">
              <ShieldCheck className="w-3 h-3" />
              Secure Pipeline
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Source Editor */}
          <div className="flex-1 border-r border-slate-800 flex flex-col">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/20 flex items-center gap-2">
              <FileCode className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Source</span>
            </div>
            <div className="flex-1 overflow-auto p-6 font-mono text-sm">
              {currentFile ? (
                <pre className="text-slate-300 leading-relaxed">{currentFile.content}</pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <FileCode className="w-12 h-12 mb-4" />
                  <p className="text-xs uppercase tracking-widest font-bold">Selecteer een bestand</p>
                </div>
              )}
            </div>
          </div>

          {/* Transpiled Editor */}
          <div className="flex-1 flex flex-col bg-slate-950/40">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Gemini 3 Pro Output</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {isProcessing && currentFile?.status === 'processing' ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-[10px] font-bold uppercase text-indigo-400 tracking-[0.2em] animate-pulse">Refactoring semantic layers...</p>
                </div>
              ) : currentFile?.outputFiles.length ? (
                currentFile.outputFiles.map((out, idx) => (
                  <div key={idx} className="mb-8 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">{out.path}</span>
                    </div>
                    <pre className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 font-mono text-sm text-slate-300 leading-relaxed shadow-inner">
                      {out.content}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Sparkles className="w-12 h-12 mb-4" />
                  <p className="text-xs uppercase tracking-widest font-bold">Wachten op conversie</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="h-10 border-t border-slate-800 bg-slate-900/50 flex items-center px-6 justify-between">
          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Engine Online
            </div>
            <span>|</span>
            <span>Gemini-3-Pro-Preview Active</span>
          </div>
          <div className="text-[10px] text-slate-600 font-mono">
            &copy; 2025 POLYGLOT SEMANTIC ENGINE
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
