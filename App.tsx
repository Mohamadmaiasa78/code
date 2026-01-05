
import React, { useState, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { 
  Language, 
  ProjectFile, 
  FileStatus, 
  ProjectAnalysis, 
  ConversionReport,
  ConversionHistoryItem
} from './types';
import { conversionService } from './services/geminiService';
import { 
  Code2, Play, Sparkles, FolderOpen, FileCode, ChevronRight,
  Loader2, Download, Layers, ShieldCheck, FileJson, FileText,
  Folder, ChevronDown, CheckCircle2, AlertTriangle, FileWarning,
  Terminal, Settings, Archive, ShieldAlert, History, Clock, 
  ArrowLeftRight, FileX, Info, KeyRound
} from 'lucide-react';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' }
];

const CONFIG_FILES = [
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js', 
  'webpack.config.js', 'pom.xml', 'composer.json', 'manifest.json', 
  '.env', '.gitignore', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
];

const CONVERTIBLE_EXTENSIONS = ['.html', '.php', '.py', '.java', '.js', '.css', '.ts', '.json', '.xml'];
const IGNORED_BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.zip'];

interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: Record<string, FileTreeNode>;
  file?: ProjectFile;
}

const App: React.FC = () => {
  const [sourceLang, setSourceLang] = useState<Language | 'auto'>('auto');
  const [targetLang, setTargetLang] = useState<Language>('java');
  const [autoSplit, setAutoSplit] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'history'>('explorer');
  
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = useMemo(() => files.find(f => f.id === selectedFileId), [files, selectedFileId]);
  const currentHistoryItem = useMemo(() => history.find(h => h.id === selectedHistoryId), [history, selectedHistoryId]);

  // Helper om AI output te valideren tegen onze Language type
  const sanitizeLanguage = (lang: string): Language => {
    const validIds = LANGUAGES.map(l => l.id);
    const normalized = lang.toLowerCase() as Language;
    return validIds.includes(normalized) ? normalized : 'javascript';
  };

  const fileTree = useMemo(() => {
    const root: FileTreeNode = { name: 'root', path: 'root', type: 'folder', children: {} };
    files.forEach(file => {
      const parts = file.path.split('/').filter(p => p !== '');
      let current = root;
      let currentPath = '';
      
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (index === parts.length - 1) {
          current.children[part] = { name: part, path: currentPath, type: 'file', children: {}, file };
        } else {
          if (!current.children[part]) {
            current.children[part] = { name: part, path: currentPath, type: 'folder', children: {} };
          }
          current = current.children[part];
        }
      });
    });
    return root;
  }, [files]);

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setErrorMessage(null);
    setZipUrl(null);
    setReport(null);
    const loadedFiles: ProjectFile[] = [];
    
    const readers = Array.from(fileList).map((fileItem, index) => {
      const file = fileItem as File & { webkitRelativePath?: string };
      const path = file.webkitRelativePath || file.name;

      return new Promise<void>((resolve) => {
        if (path.includes('node_modules/') || path.includes('.git/')) {
          resolve();
          return;
        }

        const ext = file.name.slice((file.name.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
        const isConvertible = CONVERTIBLE_EXTENSIONS.includes(`.${ext}`);
        const isIgnored = IGNORED_BINARY_EXTENSIONS.includes(`.${ext}`);
        const isConfig = CONFIG_FILES.includes(file.name);

        if (isIgnored) {
          resolve();
          return;
        }

        const isAsset = isConfig || !isConvertible;

        const reader = new FileReader();
        reader.onload = (event) => {
          loadedFiles.push({
            id: `file-${Date.now()}-${index}`,
            name: file.name,
            path: path,
            content: event.target?.result as string,
            outputFiles: isAsset ? [{ name: file.name, content: event.target?.result as string, path: path }] : [],
            status: isAsset ? 'completed' : 'idle',
            originalFile: file,
            isAsset: isAsset
          });
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    if (loadedFiles.length === 0) return;

    setFiles(loadedFiles);
    setSelectedFileId(loadedFiles[0].id);
    setIsProcessing(true);
    try {
      const res = await conversionService.analyzeProject(loadedFiles);
      setAnalysis(res);
      if (sourceLang === 'auto') {
        setSourceLang(sanitizeLanguage(res.primaryLanguage));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const runConversion = async () => {
    setIsProcessing(true);
    setProgress(0);
    setErrorMessage(null);
    setReport(null);
    setZipUrl(null);

    let splitsCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const zip = new JSZip();
    const newHistoryItems: ConversionHistoryItem[] = [];

    const effectiveSourceLang = sourceLang === 'auto' ? sanitizeLanguage(analysis?.primaryLanguage || 'javascript') : sourceLang;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.isAsset) {
        zip.file(file.path, file.content);
        setProgress(Math.round(((i + 1) / files.length) * 100));
        continue;
      }

      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
      setSelectedFileId(file.id);

      try {
        const resultFiles = await conversionService.convertFileWithSplitting(
          file, 
          effectiveSourceLang,
          targetLang,
          autoSplit
        );

        if (resultFiles.length > 1) splitsCount++;
        successCount++;

        setFiles(prev => prev.map(f => f.id === file.id ? { 
          ...f, 
          status: 'completed', 
          outputFiles: resultFiles 
        } : f));

        resultFiles.forEach(rf => zip.file(rf.path, rf.content));

        newHistoryItems.push({
          id: `hist-${Date.now()}-${file.id}`,
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          timestamp: new Date().toLocaleTimeString(),
          sourceLang: effectiveSourceLang,
          targetLang: targetLang,
          originalContent: file.content,
          outputFiles: resultFiles
        });

      } catch (err: any) {
        failedCount++;
        errors.push(`${file.path}: ${err.message}`);
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: err.message } : f));
        zip.file(file.path, file.content);
        
        if (err.message.includes("API_KEY") || err.message.includes("API-sleutel")) {
          setErrorMessage(err.message);
          setIsProcessing(false);
          return;
        }
      }

      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setHistory(prev => [...newHistoryItems, ...prev].slice(0, 50));

    const finalReport: ConversionReport = {
      timestamp: new Date().toISOString(),
      detectedProjectType: analysis?.projectType || 'Module',
      languagesFound: analysis ? [analysis.primaryLanguage] : [],
      totalFiles: files.length,
      convertedFiles: successCount,
      splitsFound: splitsCount,
      mergesFound: 0,
      manualReviewRequired: errors,
      notes: `Conversie voltooid met Gemini 3. ${successCount} geslaagd, ${failedCount} hersteld uit origineel.`
    };

    zip.file("conversion_report.json", JSON.stringify(finalReport, null, 2));
    const content = await zip.generateAsync({ type: 'blob' });
    setZipUrl(URL.createObjectURL(content));
    setReport(finalReport);
    setIsProcessing(false);
  };

  const renderTree = (node: FileTreeNode, depth = 0) => {
    const children = Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div key={node.path} className="flex flex-col">
        {node.path !== 'root' && (
          <button
            onClick={() => node.type === 'folder' ? toggleFolder(node.path) : (setSelectedFileId(node.file?.id || null), setSelectedHistoryId(null))}
            className={`w-full group flex items-center gap-1.5 px-3 py-1.5 text-left text-[11px] transition-colors border-l-2 ${
              node.type === 'file' && selectedFileId === node.file?.id 
                ? 'bg-[#2b2c2f] text-[#8ab4f8] border-[#8ab4f8]' 
                : 'text-[#9aa0a6] border-transparent hover:bg-[#202124]'
            }`}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
          >
            {node.type === 'folder' ? (
              <>
                {expandedFolders.has(node.path) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Folder className="w-3.5 h-3.5 text-[#f9ab00] opacity-80" />
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 
                  node.file?.status === 'completed' ? '#10b981' : 
                  node.file?.status === 'processing' ? '#3b82f6' : 
                  node.file?.status === 'error' ? '#f43f5e' : '#475569' 
                }} />
                {node.file?.isAsset ? <Settings className="w-3.5 h-3.5 opacity-50" /> : <FileCode className="w-3.5 h-3.5 opacity-50" />}
              </>
            )}
            <span className="truncate flex-1">{node.name}</span>
          </button>
        )}
        {(node.path === 'root' || (node.type === 'folder' && expandedFolders.has(node.path))) && (
          <div className="flex flex-col">{children.map(child => renderTree(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0f1011] text-[#e3e3e3] overflow-hidden font-sans">
      <aside className="w-80 flex flex-col border-r border-[#3c4043] bg-[#1e1f20] shrink-0">
        <div className="p-4 border-b border-[#3c4043] flex items-center gap-2">
          <Code2 className="w-6 h-6 text-[#8ab4f8]" />
          <h1 className="font-semibold text-lg tracking-tight">PolyGlot Engine</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-rose-400">
                <KeyRound className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase">Configuratie Fout</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{errorMessage}</p>
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest">Codebase</label>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#3c4043] hover:bg-[#4a4d51] border border-[#5f6368]/30 rounded-lg text-sm transition-all"
            >
              <FolderOpen className="w-4 h-4 text-[#8ab4f8]" />
              Selecteer Map
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} {...({ webkitdirectory: "", directory: "" } as any)} />
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest">Pipeline</label>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Bron</span>
              <select value={sourceLang} onChange={(e) => setSourceLang(sanitizeLanguage(e.target.value))} className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm">
                <option value="auto">Auto-detect</option>
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Doel</span>
              <select value={targetLang} onChange={(e) => setTargetLang(sanitizeLanguage(e.target.value))} className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm">
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#3c4043] space-y-3">
          {isProcessing && (
            <div className="w-full h-1 bg-[#202124] rounded-full overflow-hidden">
              <div className="h-full bg-[#8ab4f8] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
          <button 
            onClick={runConversion}
            disabled={isProcessing || files.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#8ab4f8] hover:bg-[#a6c1ee] disabled:bg-[#3c4043] text-[#1e1f20] rounded-xl font-bold transition-all shadow-xl shadow-blue-500/10"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {isProcessing ? `Converteren ${progress}%` : 'Start Conversie'}
          </button>
          
          {zipUrl && (
            <a href={zipUrl} download="PolyGlot_Build.zip" className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-xs font-bold text-[#1e1f20]">
              <Archive className="w-4 h-4" />
              Download ZIP
            </a>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#0f1011] overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 flex flex-col border-r border-[#3c4043] bg-[#1a1b1c] shrink-0">
            <div className="grid grid-cols-2 bg-[#202124] border-b border-[#3c4043]">
              <button onClick={() => setActiveSidebarTab('explorer')} className={`py-2 text-[10px] font-bold uppercase tracking-widest ${activeSidebarTab === 'explorer' ? 'text-[#8ab4f8] bg-[#1a1b1c]' : 'text-[#9aa0a6]'}`}>Explorer</button>
              <button onClick={() => setActiveSidebarTab('history')} className={`py-2 text-[10px] font-bold uppercase tracking-widest ${activeSidebarTab === 'history' ? 'text-[#8ab4f8] bg-[#1a1b1c]' : 'text-[#9aa0a6]'}`}>Logs</button>
            </div>
            <div className="flex-1 overflow-y-auto pt-2">
              {activeSidebarTab === 'explorer' ? renderTree(fileTree) : (
                history.length > 0 ? history.map(item => (
                  <button key={item.id} onClick={() => {setSelectedHistoryId(item.id); setSelectedFileId(null);}} className={`w-full p-3 text-left border-b border-[#3c4043] ${selectedHistoryId === item.id ? 'bg-[#2b2c2f]' : ''}`}>
                    <div className="text-[10px] font-bold truncate text-[#e3e3e3]">{item.fileName}</div>
                    <div className="text-[8px] text-[#9aa0a6] uppercase mt-1">{item.sourceLang} → {item.targetLang}</div>
                  </button>
                )) : <div className="p-8 text-center text-[10px] text-slate-600">Geen logs beschikbaar.</div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col border-r border-[#3c4043]">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <Terminal className="w-3 h-3 text-[#9aa0a6]" />
                  <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">Broncode</span>
                </div>
                <div className="flex-1 bg-[#0f1011] p-6 font-mono text-sm overflow-auto">
                  <pre className="text-[#e3e3e3] whitespace-pre-wrap">
                    {currentHistoryItem ? currentHistoryItem.originalContent : currentFile?.content || 'Selecteer een bestand uit de lijst om de inhoud te bekijken.'}
                  </pre>
                </div>
              </div>
              <div className="flex-1 flex flex-col bg-[#131314]">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <Sparkles className="w-3 h-3 text-[#8ab4f8]" />
                  <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">Gemini Output</span>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-[#0f1011]">
                  {isProcessing ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                      <Loader2 className="w-8 h-8 animate-spin text-[#8ab4f8]" />
                      <p className="text-[10px] text-[#8ab4f8] font-mono animate-pulse">Mapping architectural layers...</p>
                    </div>
                  ) : (currentHistoryItem?.outputFiles || currentFile?.outputFiles || []).length ? (
                    (currentHistoryItem?.outputFiles || currentFile?.outputFiles || []).map((out, idx) => (
                      <div key={idx} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-2">
                           <FileText className="w-3 h-3 text-[#8ab4f8]" />
                           <span className="text-[10px] font-bold uppercase text-[#8ab4f8]">{out.path}</span>
                        </div>
                        <pre className="p-4 bg-[#1e1f20] rounded-lg text-sm text-emerald-400 whitespace-pre-wrap border border-[#3c4043] shadow-inner font-mono">
                          {out.content}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-10">
                      <Sparkles className="w-16 h-16 mb-4" />
                      <p className="text-sm">Geen output gegenereerd.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="h-8 border-t border-[#3c4043] bg-[#1e1f20] flex items-center px-4 justify-between">
          <div className="text-[10px] font-bold text-[#5f6368]">GEMINI 3 ENGINE • ZERO-EXCEPTION POLICY</div>
          <div className="flex items-center gap-4">
             {analysis && <div className="text-[10px] text-slate-500 uppercase tracking-tighter">Project: {analysis.projectType}</div>}
             <div className="flex items-center gap-2 text-[10px] text-emerald-500">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> SYSTEEM ONLINE
             </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
