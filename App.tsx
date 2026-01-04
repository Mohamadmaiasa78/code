
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Language, 
  ProjectFile, 
  FileStatus, 
  ProjectAnalysis, 
  ConversionReport 
} from './types';
import { conversionService } from './services/geminiService';
import { 
  Code2, ArrowRightLeft, Copy, Check, AlertCircle, Play, Sparkles,
  Trash2, Terminal, Info, FolderOpen, FileCode, Files, ChevronRight,
  Loader2, Download, Layers, ShieldCheck, FileJson, FileText, Upload,
  Folder, ChevronDown
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
  { id: 'html', label: 'HTML' }
];

// Tree node interface for folder organization
interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: Record<string, FileTreeNode>;
  file?: ProjectFile;
}

const App: React.FC = () => {
  // Input Modes
  const [inputMode, setInputMode] = useState<'paste' | 'folder'>('paste');
  const [sourceLang, setSourceLang] = useState<Language | 'auto'>('auto');
  const [targetLang, setTargetLang] = useState<Language>('java');
  const [autoSplit, setAutoSplit] = useState(true);
  
  // Project State
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const currentFile = useMemo(() => files.find(f => f.id === selectedFileId), [files, selectedFileId]);

  // Build a hierarchical tree from flat files list
  const fileTree = useMemo(() => {
    const root: FileTreeNode = { name: 'root', path: 'root', type: 'folder', children: {} };
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = root;
      let currentPath = '';
      
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (index === parts.length - 1) {
          current.children[part] = { 
            name: part, 
            path: currentPath, 
            type: 'file', 
            children: {}, 
            file 
          };
        } else {
          if (!current.children[part]) {
            current.children[part] = { 
              name: part, 
              path: currentPath, 
              type: 'folder', 
              children: {} 
            };
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

    const loadedFiles: ProjectFile[] = [];
    const readers = Array.from(fileList).map((fileItem, index) => {
      const file = fileItem as File & { webkitRelativePath?: string };
      return new Promise<void>((resolve) => {
        const isAsset = /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/i.test(file.name);
        if (isAsset) {
          loadedFiles.push({
            id: `asset-${Date.now()}-${index}`,
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: '[Binary Asset - Preserved]',
            outputFiles: [{ name: file.name, content: '[Binary Asset - Preserved]', path: file.webkitRelativePath || file.name }],
            status: 'completed',
            isAsset: true
          });
          resolve();
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          loadedFiles.push({
            id: `file-${Date.now()}-${index}`,
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: event.target?.result as string,
            outputFiles: [],
            status: 'idle'
          });
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    setFiles(loadedFiles);
    setInputMode('folder');
    if (loadedFiles.length > 0) setSelectedFileId(loadedFiles[0].id);
    
    // Auto-expand paths for visible files
    const pathsToExpand = new Set(['root']);
    loadedFiles.forEach(f => {
      const parts = f.path.split('/');
      let current = '';
      parts.slice(0, -1).forEach(p => {
        current = current ? `${current}/${p}` : p;
        pathsToExpand.add(current);
      });
    });
    setExpandedFolders(pathsToExpand);

    setIsProcessing(true);
    try {
      const result = await conversionService.analyzeProject(loadedFiles);
      setAnalysis(result);
      if (sourceLang === 'auto') setSourceLang(result.primaryLanguage);
    } catch (err) {
      console.error("Analysis failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const runConversion = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    setReport(null);

    let splits = 0;
    let successful = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.isAsset) {
        successful++;
        continue;
      }

      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
      setSelectedFileId(file.id);

      try {
        const resultFiles = await conversionService.convertFileWithSplitting(
          file, 
          sourceLang === 'auto' ? (analysis?.primaryLanguage || 'python') : sourceLang,
          targetLang,
          autoSplit
        );

        if (resultFiles.length > 1) splits++;
        successful++;

        setFiles(prev => prev.map(f => f.id === file.id ? { 
          ...f, 
          status: 'completed', 
          outputFiles: resultFiles 
        } : f));
      } catch (err: any) {
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: err.message } : f));
      }

      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setReport({
      timestamp: new Date().toISOString(),
      detectedProjectType: analysis?.projectType || 'Generic Codebase',
      languagesFound: analysis?.primaryLanguage ? [analysis.primaryLanguage] : [],
      totalFiles: files.length,
      convertedFiles: successful,
      splitsFound: splits,
      mergesFound: 0,
      manualReviewRequired: files.filter(f => f.status === 'error').map(f => f.name),
      notes: "Project transpilation complete. Assets preserved in target directory."
    });

    setIsProcessing(false);
  };

  const handleDownload = () => {
    const manifest = {
      report,
      files: files.flatMap(f => f.outputFiles)
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_project_${Date.now()}.json`;
    a.click();
  };

  // Recursive renderer for the file tree
  const renderTree = (node: FileTreeNode, depth = 0) => {
    const children = Object.values(node.children).sort((a, b) => {
      // Folders first
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div key={node.path} className="flex flex-col">
        {node.path !== 'root' && (
          <button
            onClick={() => node.type === 'folder' ? toggleFolder(node.path) : setSelectedFileId(node.file?.id || null)}
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
                <FileCode className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
              </>
            )}
            <span className="truncate flex-1">{node.name}</span>
            {node.file && node.file.outputFiles.length > 1 && (
              <span className="text-[8px] bg-[#3c4043] text-white px-1 rounded">SPLIT</span>
            )}
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
              <div className="space-y-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload}
                  {...({ webkitdirectory: "", directory: "" } as any)} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#3c4043] hover:bg-[#4a4d51] border border-[#5f6368]/30 rounded-lg text-sm transition-all text-[#e3e3e3]"
                >
                  <FolderOpen className="w-4 h-4 text-[#8ab4f8]" />
                  Load Folder
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest">Pipeline Config</label>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Source Language</span>
              <select 
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as any)}
                className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm text-[#e3e3e3] outline-none focus:border-[#8ab4f8]"
              >
                <option value="auto">Auto-detect</option>
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <span className="text-xs text-[#9aa0a6]">Target Language</span>
              <select 
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as Language)}
                className="w-full bg-[#0f1011] border border-[#3c4043] rounded-lg p-2 text-sm text-[#e3e3e3] outline-none focus:border-[#8ab4f8]"
              >
                {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#2b2c2f] rounded-lg border border-[#3c4043]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs">Auto-split/merge</span>
              </div>
              <input 
                type="checkbox" 
                checked={autoSplit} 
                onChange={(e) => setAutoSplit(e.target.checked)}
                className="accent-[#8ab4f8] h-4 w-4"
              />
            </div>
          </div>

          {analysis && (
            <div className="p-3 bg-[#0f1011] rounded-lg border border-[#3c4043] space-y-2">
              <div className="flex items-center gap-2 text-[#8ab4f8]">
                <ShieldCheck className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Pre-Analysis</span>
              </div>
              <div className="text-xs text-[#e3e3e3] font-medium">{analysis.projectType}</div>
              <div className="text-[10px] text-[#9aa0a6]">Primary: <span className="text-white capitalize">{analysis.primaryLanguage}</span></div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#3c4043] space-y-3">
          <button 
            onClick={runConversion}
            disabled={isProcessing || files.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#8ab4f8] hover:bg-[#a6c1ee] disabled:bg-[#3c4043] disabled:text-[#9aa0a6] text-[#1e1f20] rounded-xl font-bold transition-all shadow-xl shadow-blue-500/10 active:scale-[0.98]"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {isProcessing ? `Processing ${progress}%` : 'Execute Migration'}
          </button>
          {report && (
            <button 
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-transparent hover:bg-[#3c4043] border border-[#3c4043] rounded-xl text-xs font-semibold text-[#8ab4f8] transition-all"
            >
              <Download className="w-4 h-4" />
              Download Build Artifacts (.json)
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#0f1011] overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {files.length > 0 && (
            <div className="w-64 flex flex-col border-r border-[#3c4043] bg-[#1a1b1c] shrink-0">
              <div className="px-4 py-2 bg-[#202124] border-b border-[#3c4043] flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9aa0a6]">Project Explorer</span>
                <span className="text-[10px] text-[#5f6368]">{files.length} items</span>
              </div>
              <div className="flex-1 overflow-y-auto pt-2">
                {renderTree(fileTree)}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {report && (
              <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <FileJson className="w-5 h-5 text-indigo-400" />
                  <div>
                    <div className="text-xs font-bold uppercase text-[#9aa0a6]">Migration Success</div>
                    <div className="text-[10px] text-slate-400">{report.convertedFiles}/{report.totalFiles} files converted. {report.splitsFound} splits generated.</div>
                  </div>
                </div>
                <button className="px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-full transition-all">View report.json</button>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col border-r border-[#3c4043]">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <Terminal className="w-3 h-3 text-[#9aa0a6]" />
                  <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">Original: {currentFile?.path || 'Source'}</span>
                </div>
                {inputMode === 'paste' ? (
                  <textarea
                    value={files[0]?.content || ''}
                    onChange={(e) => {
                      const newFile = {
                        id: 'paste-1',
                        name: 'snippet.txt',
                        path: 'snippet.txt',
                        content: e.target.value,
                        outputFiles: [],
                        status: 'idle' as FileStatus
                      };
                      setFiles([newFile]);
                      setSelectedFileId('paste-1');
                    }}
                    className="flex-1 w-full bg-[#0f1011] p-6 text-sm font-mono text-[#e3e3e3] outline-none resize-none placeholder:text-[#3c4043]"
                    placeholder="// Paste code snippet here..."
                  />
                ) : (
                  <div className="flex-1 bg-[#0f1011] p-6 font-mono text-sm overflow-auto text-slate-500">
                    {currentFile ? (
                      <pre className="text-[#e3e3e3]">{currentFile.content}</pre>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
                        <FolderOpen className="w-12 h-12 mb-4 mx-auto" />
                        <p>Project loaded. Select a file from the explorer.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col bg-[#131314]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#202124] border-b border-[#3c4043]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-[#8ab4f8]" />
                    <span className="text-[10px] font-medium uppercase text-[#9aa0a6]">Target Build</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-[#0f1011]">
                  {currentFile?.status === 'processing' ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                      <Loader2 className="w-8 h-8 text-[#8ab4f8] animate-spin" />
                      <p className="text-xs font-mono text-[#8ab4f8]">Transpiling constructs...</p>
                    </div>
                  ) : currentFile?.outputFiles.length ? (
                    currentFile.outputFiles.map((out, idx) => (
                      <div key={idx} className="mb-8 last:mb-0">
                        <div className="flex items-center gap-2 mb-2 text-[#8ab4f8]">
                          <FileText className="w-3 h-3" />
                          <span className="text-[10px] font-bold uppercase">{out.path}</span>
                        </div>
                        <pre className="p-4 bg-[#1e1f20] border border-[#3c4043] rounded-lg text-sm font-mono text-emerald-400 whitespace-pre-wrap">
                          {out.content}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-700 italic">
                      <Sparkles className="w-12 h-12 mb-4 opacity-10" />
                      <p>Run migration to view output</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8 border-t border-[#3c4043] bg-[#1e1f20] flex items-center px-4 justify-between">
          <div className="flex items-center gap-6 text-[10px] font-medium text-[#9aa0a6]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
              SYSTEM READY
            </div>
            {analysis && <span>ROOT: {analysis.projectType}</span>}
          </div>
          <div className="text-[10px] text-[#5f6368] font-bold tracking-tighter">
            GEMINI ENGINE V3 • HIERARCHICAL MAPPING ENABLED
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
