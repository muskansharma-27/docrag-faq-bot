import React, { useState, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite standard way to load pdf.js worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import { User } from 'firebase/auth';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { Document } from '../types';
import { 
  Upload, 
  Search, 
  Plus, 
  FileText, 
  History, 
  Trash2, 
  Edit3, 
  ChevronRight,
  MoreVertical,
  X,
  Save,
  Clock
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

type PdfTextItem = {
  str?: string;
};

const normalizeExtractedText = (value: string) =>
  value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

const extractPdfTextWithPdfJs = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    let pageText = '';
    let lastY = -1;
    let lastX = -1;
    let lastWidth = 0;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      
      const textItem = item as any;
      const str = textItem.str;
      const x = textItem.transform[4];
      const y = textItem.transform[5];
      const width = textItem.width;
      const height = Math.abs(textItem.transform[3]); 
      
      // If Y changes significantly, we are on a new line
      if (lastY !== -1 && Math.abs(y - lastY) > height * 0.4) {
        pageText += '\n';
        lastX = -1; 
      }
      
      // Calculate horizontal gap to preserve spacing
      if (lastX !== -1) {
        const gap = x - (lastX + lastWidth);
        if (gap > 0) {
          const spaceWidth = height * 0.25; // Approximate width of a space character
          if (spaceWidth > 0) {
            const spacesCount = Math.floor(gap / spaceWidth);
            if (spacesCount > 0) {
              pageText += ' '.repeat(spacesCount);
            }
          }
        }
      }
      
      pageText += str;
      lastY = y;
      lastX = x;
      lastWidth = width;
      
      if (textItem.hasEOL) {
        pageText += '\n';
        lastY = -1;
        lastX = -1;
      }
    }

    if (pageText.trim()) {
      pages.push(pageText);
    }
  }

  return normalizeExtractedText(pages.join('\n\n'));
};

const extractPdfTextWithServer = async (file: File) => {
  let response: Response;
  try {
    response = await fetch('/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
  } catch {
    throw new Error('Could not reach the PDF extraction server. Make sure the app is running with npm run dev.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { error: await response.text().catch(() => '') };

  if (!response.ok) {
    const serverMessage = typeof data.error === 'string' ? data.error.trim() : '';
    if (response.status === 404 || serverMessage.startsWith('<!DOCTYPE')) {
      throw new Error('PDF extraction endpoint was not found. Restart the dev server so the new server.ts route is loaded.');
    }
    throw new Error(serverMessage || `Server PDF extraction failed with HTTP ${response.status}.`);
  }

  return normalizeExtractedText(data.text || '');
};

export default function DocumentManager({ user }: { user: User }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorFileData, setEditorFileData] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'text' | 'pdf'>('text');

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsArr = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document));
      setDocuments(docsArr);
    });
    return () => unsubscribe();
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true);
    for (const file of acceptedFiles) {
      try {
        let text = '';
        let fileData = undefined;
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          if (file.size < 800 * 1024) { // 800KB limit for base64 storage
             fileData = await toBase64(file);
          } else {
             toast.info(`${file.name} is too large to store the original view, but text extraction will continue.`);
          }
          
          text = await extractPdfTextWithPdfJs(file);

          if (!text) {
            text = await extractPdfTextWithServer(file);
          }
        } else {
          text = normalizeExtractedText(await file.text());
        }

        if (!text) {
          throw new Error('No readable text was found in this file. If it is a scanned PDF, configure GEMINI_API_KEY and upload it again.');
        }

        await addDoc(collection(db, 'documents'), {
          title: file.name,
          content: text.slice(0, 100000), // Safety limit
          fileData: fileData || null,
          version: 1,
          authorId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err: any) {
        console.error("PDF parsing error:", err);
        toast.error(`Error uploading ${file.name}: ${err.message}`);
      }
    }
    setIsUploading(false);
  }, [user.uid]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'text/plain': ['.txt'], 'application/pdf': ['.pdf'], 'text/markdown': ['.md'] },
    multiple: true
  } as any);

  const handleSave = async () => {
    if (!editorTitle.trim() || !editorContent.trim()) {
      toast.error("Title and content are required");
      return;
    }

    try {
      if (editingDoc) {
        await updateDoc(doc(db, 'documents', editingDoc.id), {
          title: editorTitle,
          content: editorContent,
          fileData: editorFileData || null,
          version: editingDoc.version + 1,
          updatedAt: serverTimestamp(),
        });
        toast.success("Document updated and versioned");
      } else {
        await addDoc(collection(db, 'documents'), {
          title: editorTitle,
          content: editorContent,
          fileData: editorFileData || null,
          version: 1,
          authorId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("New document created");
      }
      setShowEditor(false);
      setEditingDoc(null);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const deleteDocument = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this document?")) {
      try {
        await deleteDoc(doc(db, 'documents', id));
        toast.success("Document deleted");
      } catch (err: any) {
        toast.error(`Error deleting document: ${err.message}`);
      }
    }
  };

  const filteredDocs = documents.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Knowledge Base</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage the documents used for RAG responses.</p>
        </div>
        <button 
          onClick={() => {
            setEditingDoc(null);
            setEditorTitle('');
            setEditorContent('');
            setEditorFileData(undefined);
            setViewMode('text');
            setShowEditor(true);
          }}
          className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-5 py-2.5 rounded-xl hover:bg-white/20 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] text-sm font-bold tracking-wide"
        >
          <Plus className="w-5 h-5" />
          Create New
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">
          {/* Search bar */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              <input 
                type="text" 
                placeholder="Search documents by title or content..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all shadow-xl"
              />
            </div>
          </div>

          {/* Doc List */}
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredDocs.map((doc) => (
                <motion.div
                  layout
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-zinc-900/40 backdrop-blur-xl p-5 rounded-3xl border border-white/5 shadow-lg hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:border-purple-500/30 transition-all duration-300 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl group-hover:bg-purple-500/20 transition-colors shadow-[0_0_15px_rgba(168,85,247,0.1)] group-hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                      <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white truncate text-lg">{doc.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
                        <span className="flex items-center gap-1 font-semibold bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-zinc-300">
                          v{doc.version}.0
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                           {doc.updatedAt?.toDate?.() ? new Date(doc.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingDoc(doc);
                        setEditorTitle(doc.title);
                        setEditorContent(doc.content);
                        setEditorFileData(doc.fileData);
                        setViewMode(doc.fileData ? 'pdf' : 'text');
                        setShowEditor(true);
                      }}
                      className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => deleteDocument(doc.id)}
                      className="p-2.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredDocs.length === 0 && !isUploading && (
              <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-white/10 backdrop-blur-xl">
                <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400 font-medium">No documents found matching your search</p>
                <p className="text-xs text-zinc-500 mt-2">Upload files or create them manually to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Upload Column */}
        <div className="lg:w-80 flex-shrink-0">
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300 cursor-pointer h-full min-h-[300px] flex flex-col items-center justify-center bg-zinc-900/40 backdrop-blur-xl shadow-lg relative overflow-hidden group",
              isDragActive ? "border-purple-500 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.2)]" : "border-white/10 hover:border-purple-500/50 hover:bg-white/5",
              isUploading && "opacity-50 pointer-events-none"
            )}
          >
            {isDragActive && <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/10 z-0"></div>}
            <input {...getInputProps()} />
            <div className="relative z-10 flex flex-col items-center">
              <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(168,85,247,0.15)] group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]">
                <Upload className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="font-bold text-white mb-2 text-lg">Upload Documents</h3>
              <p className="text-sm text-zinc-400 px-2 leading-relaxed">
                Drag & drop files here, or click to select files.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-white/5 px-2 py-1 rounded-md border border-white/5">.TXT</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-white/5 px-2 py-1 rounded-md border border-white/5">.PDF</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-white/5 px-2 py-1 rounded-md border border-white/5">.MD</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full screen editor overlay */}
      <AnimatePresence>
        {showEditor && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md shadow-2xl"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-zinc-950 w-full max-w-5xl h-[85vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl border border-white/10 relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-10 w-full"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-purple-500/20 border border-purple-500/30 p-2.5 rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    <FileText className="w-6 h-6 text-purple-400" />
                  </div>
                  <h2 className="font-extrabold text-white text-xl tracking-wide">{editingDoc ? 'Edit Document' : 'New Document'}</h2>
                </div>
                <button onClick={() => setShowEditor(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              
              <div className="flex-1 p-8 space-y-8 overflow-y-auto bg-zinc-950">
                <div>
                  <label className="block text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">Document Title</label>
                  <input 
                    type="text" 
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    placeholder="Enter an intuitive title..."
                    className="w-full text-4xl font-extrabold text-white placeholder:text-zinc-700 bg-transparent border-none focus:outline-none tracking-tight"
                  />
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-blue-400 uppercase tracking-widest">Content Body</label>
                    {editorFileData && (
                      <button 
                        onClick={() => setViewMode(viewMode === 'pdf' ? 'text' : 'pdf')} 
                        className="text-xs font-bold px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all shadow-sm"
                      >
                        {viewMode === 'pdf' ? 'Edit Extracted Text' : 'View Original PDF'}
                      </button>
                    )}
                  </div>
                  {viewMode === 'pdf' && editorFileData ? (
                    <div className="flex-1 w-full bg-zinc-900/50 rounded-3xl border border-white/5 overflow-hidden flex flex-col shadow-inner">
                       <iframe src={editorFileData} className="w-full flex-1 min-h-[500px]" title={editorTitle} />
                    </div>
                  ) : (
                    <textarea 
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      placeholder="Start typing your knowledge base content here..."
                      className="flex-1 w-full p-6 bg-zinc-900/50 rounded-3xl border border-white/5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none font-mono text-sm leading-relaxed min-h-[400px] text-zinc-300 placeholder:text-zinc-600 transition-all shadow-inner"
                    />
                  )}
                </div>
              </div>

              <div className="p-6 bg-zinc-900/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-between sticky bottom-0 z-10 w-full">
                <div className="flex items-center gap-6 text-sm text-zinc-400">
                  {editingDoc && (
                    <div className="flex items-center gap-2 font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-lg shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                      <History className="w-4 h-4" />
                      Will increment to v{editingDoc.version + 1}.0
                    </div>
                  )}
                  <span className="font-mono bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">{editorContent.length} chars</span>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowEditor(false)}
                    className="px-6 py-3 font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] font-bold tracking-wide"
                  >
                    <Save className="w-5 h-5" />
                    {editingDoc ? 'Update Document' : 'Save Document'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
