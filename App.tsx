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
  Eye, Trash2, ArrowLeftRight
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

const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.zip', '.pdf', '.exe', '.dll', '.bin', '.obj', '.svg', '.ico', '.woff', '.woff2', '.ttf'];

interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: Record<string, FileTreeNode>;
  file?: ProjectFile;
}

const App: React.FC = () => {
  const [inputMode, setInputMode] = useState<'paste' | 'folder'>('paste');
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = useMemo(() => files.find(f => f.id === selectedFileId), [files, selectedFileId]);
  const currentHistoryItem = useMemo(() => history.find(h => h.id === selectedHistoryId), [history, selectedHistoryId]);

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
        const isBinary = BINARY_EXTENSIONS.includes(`.${ext}`);
        const isConfig = CONFIG_FILES.includes(file.name);

        if (isBinary) {
          loadedFiles.push({
            id: `asset-${Date.now()}-${index}`,
            name: file.name,
            path: path,
            content: '[Binary Content]',
            outputFiles: [],
            status: 'completed',
            isAsset: true,
            originalFile: file
          });
          resolve();
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          loadedFiles.push({
            id: `file-${Date.now()}-${index}`,
            name: file.name,
            path: path,
            content: event.target?.result as string,
            outputFiles: [],
            status: isConfig ? 'completed' : 'idle',
            originalFile: file,
            ...(isConfig ? { outputFiles: [{ name: file.name, content: event.target?.result as string, path: path }] } : {})
          });
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    setFiles(loadedFiles);
    setInputMode('folder');
    if (loadedFiles.length > 0) {
      setSelectedFileId(loadedFiles[0].id);
      setIsProcessing(true);
      try {
        const res = await conversionService.analyzeProject(loadedFiles);
        setAnalysis(res);
        if (sourceLang === 'auto') setSourceLang(res.primaryLanguage as Language);
      } catch (err) {
        console.error("Analyse mislukt", err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const runConversion = async () => {
    setIsProcessing(true);
    setProgress(0);
    setReport(null);
    setZipUrl(null);

    let splits = 0;
    let convertedCount = 0;
    let preservedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const zip = new JSZip();
    const newHistoryItems: ConversionHistoryItem[] = [];

    const effectiveSourceLang = sourceLang === 'auto' ? (analysis?.primaryLanguage as Language || 'javascript') : sourceLang;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isConfig = CONFIG_FILES.includes(file.name);
      
      if (file.isAsset || isConfig) {
        preservedCount++;
        if (file.isAsset && file.originalFile) {
          zip.file(file.path, file.originalFile);
        } else {
          zip.file(file.path, file.content);
        }
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

        if (resultFiles.length > 1) splits++;
        convertedCount++;

        setFiles(prev => prev.map(f => f.id === file.id ? { 
          ...f, 
          status: 'completed', 
          outputFiles: resultFiles 
        } : f));

        resultFiles.forEach(rf => {
          zip.file(rf.path, rf.content);
        });

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
        errorCount++;
        errors.push(file.name);
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: err.message } : f));
        zip.file(file.path, file.content);
      }

      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setHistory(prev => [...newHistoryItems, ...prev].slice(0, 50));

    const conversionReport: ConversionReport = {
      timestamp: new Date().toISOString(),
      detectedProjectType: analysis?.projectType || 'Generic Codebase',
      languagesFound: analysis ? [analysis.primaryLanguage] : [],
      totalFiles: files.length,
      convertedFiles: convertedCount,
      splitsFound: splits,
      mergesFound: 0,
      manualReviewRequired: errors,
      notes: `Strict migration engine: ${convertedCount} bestanden geconverteerd.`
    };

    zip.file("conversion_report.json", JSON.stringify(conversionReport, null, 2));
    
    const content = await zip.generateAsync({ type: 'blob' });
    setZipUrl(URL.createObjectURL(content));
    setReport(conversionReport);
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
            onClick={() => {
              if (node.type === 'folder') {
                toggleFolder(node.path);
              } else {
                setSelectedFileId(node.file?.id || null);
                setSelectedHistoryId(null);
              }
            }}
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
                {CONFIG_FILES.includes(node.name) ? <Settings className="w-3.5 h-3.5 opacity-50" /> : <FileCode className="w-3.5 h-3.5 opacity-50" />}
              </>
            )}
            <span className="truncate flex-1">{node.name}</span>
            {node.file?.isAsset && <span className="text-[8px] bg-slate-700 text-slate-400 px-1 rounded">ASSET</span>}
          </button>
        )}
        
        {(node.path === 'root' || (node.type === 'folder' && expandedFolders.has(node.path))) && (
          <div className="flex flex-col">
            {children.map(child => renderTree(child, depth + 1))}
          </div>
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
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-red-400">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Strict Policy</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Configuratiebestanden & binaries worden exact behouden. Logica-mapping bewaart de architectuur.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest">Input Source</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#0f1011] rounded-lg border border-[#3c4043]">
              <button 
                onClick={() => setInputMode('paste')}
                className={`py-1.5 text-xs rounded transition-all ${inputMode === 'paste' ? 'bg-[#3c4043] text-[#8ab4f8]' : 'text-[#9aa0a6]'}`}
              >Snippet</button>
              <button 
                onClick={() => setInputMode('folder')}
                className={`py-1.5 text-xs rounded transition-all ${inputMode === 'folder' ? 'bg-[#3c4043] text-[#8ab4f8]' : 'text-[#9aa0a6]'}`}
              >Project</button>
            </div>

            {inputMode === 'folder' && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#3c4043] hover:bg-[#4a4d51] border border-[#5f6368]/30 rounded-lg text-sm transition-all text-[#e3e3e3]"
              >
                <FolderOpen className="w-4 h-4 text-[#8ab4f8]" />
                Project laden
              </button>
            )}
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} {...({ webkitdirectory: "", directory: "" } as any)} />
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest">Pipeline Config</label>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Bron</span>
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value as any)} className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm">
                <option value="auto">Auto-detect</option>
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Doel</span>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value as Language)} className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm">
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
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#8ab4f8] hover:bg-[#a6c1ee] disabled:bg-[#3c4043] disabled:text-[#9aa0a6] text-[#1e1f20] rounded-xl font-bold transition-all shadow-xl shadow-blue-500/10 active:scale-[0.98]"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {isProcessing ? `Migratie ${progress}%` : 'Migratie Uitvoeren'}
          </button>
          
          {zipUrl && (
            <a href={zipUrl} download="PolyGlot_Build.zip" className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-xs font-bold text-[#1e1f20]">
              <Archive className="w-4 h-4" />
              Download Build Artifact
            </a>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#0f1011] overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 flex flex-col border-r border-[#3c4043] bg-[#1a1b1c] shrink-0">
            <div className="grid grid-cols-2 bg-[#202124] border-b border-[#3c4043]">
              <button 
                onClick={() => setActiveSidebarTab('explorer')}
                className={`py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${activeSidebarTab === 'explorer' ? 'text-[#8ab4f8] bg-[#1a1b1c]' : 'text-[#9aa0a6] hover:bg-[#2b2c2f]'}`}
              >
                <Folder className="w-3 h-3" /> Explorer
              </button>
              <button 
                onClick={() => setActiveSidebarTab('history')}
                className={`py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${activeSidebarTab === 'history' ? 'text-[#8ab4f8] bg-[#1a1b1c]' : 'text-[#9aa0a6] hover:bg-[#2b2c2f]'}`}
              >
                <History className="w-3 h-3" /> Historie
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pt-2">
              {activeSidebarTab === 'explorer' ? (
                files.length > 0 ? renderTree(fileTree) : (
                  <div className="p-8 text-center opacity-20"><FolderOpen className="w-8 h-8 mx-auto mb-2" /><p className="text-[10px]">Leeg Project</p></div>
                )
              ) : (
                <div className="flex flex-col">
                  {history.length > 0 ? history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedHistoryId(item.id);
                        setSelectedFileId(null);
                      }}
                      className={`w-full group flex flex-col gap-1 px-4 py-3 text-left border-b border-[#3c4043] transition-colors ${selectedHistoryId === item.id ? 'bg-[#2b2c2f]' : 'hover:bg-[#202124]'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold truncate ${selectedHistoryId === item.id ? 'text-[#8ab4f8]' : 'text-[#e3e3e3]'}`}>{item.fileName}</span>
                        <span className="text-[8px] text-[#9aa0a6]">{item.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[8px] text-[#9aa0a6]">
                        <span className="uppercase">{item.sourceLang}</span>
                        <ArrowLeftRight className="w-2 h-2" />
                        <span className="uppercase">{item.targetLang}</span>
                      </div>
                    </button>
                  )) : (
                    <div className="p-8 text-center opacity-20"><Clock className="w-8 h-8 mx-auto mb-2" /><p className="text-[10px]">Nog geen historie</p></div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col border-r border-[#3c4043]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-[#9aa0a6]" />
                    <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">
                      {currentHistoryItem ? 'Origineel (Historie)' : (currentFile ? `Bron: ${currentFile.path}` : 'Code Preview')}
                    </span>
                  </div>
                </div>
                <div className="flex-1 bg-[#0f1011] p-6 font-mono text-sm overflow-auto text-slate-500">
                  {currentHistoryItem ? (
                    <pre className="text-[#e3e3e3] whitespace-pre-wrap">{currentHistoryItem.originalContent}</pre>
                  ) : currentFile ? (
                    currentFile.isAsset ? (
                      <div className="flex flex-col items-center justify-center h-full opacity-50 text-center"><Archive className="w-12 h-12 mb-2" /><p>Binary Asset Behouden</p></div>
                    ) : (
                      <pre className="text-[#e3e3e3] whitespace-pre-wrap">{currentFile.content}</pre>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-20"><FolderOpen className="w-12 h-12 mb-4" /><p>Selecteer een bestand</p></div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-[#131314]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-[#8ab4f8]" />
                    <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">
                      {currentHistoryItem ? 'Output (Historie)' : 'Target Build Output'}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-[#0f1011]">
                  {currentFile?.status === 'processing' ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4"><Loader2 className="w-8 h-8 text-[#8ab4f8] animate-spin" /><p className="text-xs font-mono text-[#8ab4f8]">Transpileren...</p></div>
                  ) : (currentHistoryItem?.outputFiles || currentFile?.outputFiles || []).length ? (
                    (currentHistoryItem?.outputFiles || currentFile?.outputFiles || []).map((out, idx) => (
                      <div key={idx} className="mb-8 last:mb-0">
                        <div className="flex items-center gap-2 mb-2 text-[#8ab4f8]"><FileText className="w-3 h-3" /><span className="text-[10px] font-bold uppercase">{out.path}</span></div>
                        <pre className="p-4 bg-[#1e1f20] border border-[#3c4043] rounded-lg text-sm font-mono text-emerald-400 whitespace-pre-wrap">{out.content}</pre>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-20"><Sparkles className="w-12 h-12" /></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8 border-t border-[#3c4043] bg-[#1e1f20] flex items-center px-4 justify-between">
          <div className="flex items-center gap-6 text-[10px] font-medium text-[#9aa0a6]">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" /> ENGINE ACTIEF</div>
            {analysis && <span className="uppercase">Project: {analysis.projectType}</span>}
          </div>
          <div className="text-[10px] text-[#5f6368] font-bold tracking-tighter">GEMINI 1.5 PRO • MAPPING HISTORY ENABLED</div>
        </div>
      </main>
    </div>
  );
};

export default App;