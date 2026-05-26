import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';
import { Message, Document } from '../types';
import {
  Send,
  Bot,
  User as UserIcon,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Info,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type DocumentContext = {
  title: string;
  content: string;
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const getSearchTerms = (queryText: string) => {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i',
    'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
    'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
  ]);

  return queryText
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !stopWords.has(term)) || [];
};

const chunkDocument = (doc: Document, chunkSize = 1200, overlap = 180) => {
  const content = normalizeText(doc.content || '');
  const chunks: DocumentContext[] = [];

  for (let start = 0; start < content.length; start += chunkSize - overlap) {
    const chunk = content.slice(start, start + chunkSize).trim();
    if (chunk) {
      chunks.push({ title: doc.title, content: chunk });
    }
  }

  return chunks;
};

const getRelevantDocumentContext = (docs: Document[], question: string) => {
  const terms = getSearchTerms(question);
  const chunks = docs.flatMap((doc) => chunkDocument(doc));

  const ranked = chunks
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.content}`.toLowerCase();
      const score = terms.reduce((total, term) => {
        const matches = haystack.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'))?.length || 0;
        return total + matches;
      }, 0);

      return { ...chunk, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestMatches = ranked.filter((chunk) => chunk.score > 0).slice(0, 8);
  return bestMatches.length > 0 ? bestMatches : ranked.slice(0, 5);
};

const isGreeting = (value: string) => {
  const cleanValue = value.trim().replace(/[.,!?'"]/g, '').toLowerCase();
  return /^(hi|hello|hey|hlo|hy|hii|hiii|hyee|heyo|hola|greetings|good morning|good afternoon|good evening)(?:\s+(there|bot|assistant|friend))?$/i.test(cleanValue);
};

const greetingReply = "Hello! 👋 I am your Knowledge Assistant. I can answer questions about the HR policies and product guides. What would you like to know?";

export default function ChatBot({ user }: { user: User }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return sessionStorage.getItem(`activeConversationId_${user.uid}`);
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesPath = activeConversationId
    ? `users/${user.uid}/conversations/${activeConversationId}/messages`
    : null;

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Auto-focus input when bot finishes typing
  useEffect(() => {
    if (!isTyping && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTyping]);

  // Load or create conversation
  useEffect(() => {
    if (!activeConversationId) {
      const newId = 'conv_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(`activeConversationId_${user.uid}`, newId);
      setActiveConversationId(newId);
      return;
    }

    if (!messagesPath) return;

    const q = query(
      collection(db, messagesPath),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeConversationId, messagesPath]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping || !messagesPath) return;

    const userMessageContent = input.trim();
    setInput('');
    setIsTyping(true);

    try {
      // 1. Log User Message to Firestore
      await addDoc(collection(db, messagesPath), {
        content: userMessageContent,
        role: 'user',
        createdAt: serverTimestamp(),
      });

      if (isGreeting(userMessageContent)) {
        await addDoc(collection(db, messagesPath), {
          content: greetingReply,
          role: 'bot',
          createdAt: serverTimestamp(),
        });
        return;
      }

      // 2. Pull the latest Knowledge Base text and send the most relevant chunks.
      const docsSnapshot = await getDocs(query(collection(db, 'documents'), orderBy('updatedAt', 'desc')));
      const docs = docsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Document));
      const documentContext = getRelevantDocumentContext(docs, userMessageContent);

      if (docs.length === 0) {
        throw new Error('No documents are uploaded yet. Add documents to the Knowledge Base first.');
      }

      if (documentContext.length === 0) {
        throw new Error('The uploaded documents do not contain readable text yet.');
      }

      // 3. Call local proxy to avoid CORS
      const webhookUrl = '/api/chat';

      let response: Response;
      try {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: userMessageContent,
            documents: documentContext,
          })
        });
      } catch {
        throw new Error('Could not reach the chat server. Start the app with npm run dev, then try again.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.answer || `Server returned ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const botReply = data.answer || "I'm sorry, I couldn't generate a response.";

      // 4. Log Bot Message to Firestore
      await addDoc(collection(db, messagesPath), {
        content: botReply,
        role: 'bot',
        createdAt: serverTimestamp(),
      });

    } catch (err: any) {
      console.error(err);
      
      let errorMessage = err.message || "An unknown error occurred.";
      try {
         const jsonMatch = errorMessage.match(/\{.*\}/);
         if (jsonMatch) {
           const parsed = JSON.parse(jsonMatch[0]);
           if (parsed?.error?.message) {
             errorMessage = parsed.error.message;
           } else if (parsed?.message) {
             errorMessage = parsed.message;
           }
         }
      } catch (e) {}

      toast.error("Error communicating with AI: " + errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = async () => {
    if (!messagesPath || isTyping || isClearingChat) return;

    if (messages.length === 0) {
      toast.info('There are no messages to delete.');
      return;
    }

    const shouldDelete = window.confirm('Delete all messages in this chat?');
    if (!shouldDelete) return;

    setIsClearingChat(true);
    try {
      const messagesRef = collection(db, messagesPath);
      const snapshot = await getDocs(messagesRef);
      const batches: ReturnType<typeof writeBatch>[] = [];

      snapshot.docs.forEach((messageDoc, index) => {
        const batchIndex = Math.floor(index / 450);
        if (!batches[batchIndex]) {
          batches[batchIndex] = writeBatch(db);
        }
        batches[batchIndex].delete(messageDoc.ref);
      });

      await Promise.all(batches.map((batch) => batch.commit()));
      setMessages([]);
      setInput('');
      toast.success('Chat deleted.');
    } catch (err: any) {
      toast.error(`Could not delete chat: ${err.message}`);
    } finally {
      setIsClearingChat(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-zinc-900/40 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500"></div>

      {/* Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-zinc-900/60 z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <Bot className="w-6 h-6" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-zinc-900 shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
          </div>
          <div>
            <h2 className="font-extrabold text-white text-lg tracking-wide">Knowledge Assistant</h2>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md mt-1 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              Powered by RAG
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            className={`p-2.5 rounded-xl transition-all border ${showInfo ? 'text-white bg-white/10 border-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'}`}
            aria-label="Show assistant information"
            aria-expanded={showInfo}
            title="Assistant information"
          >
            <Info className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleClearChat}
            disabled={messages.length === 0 || isTyping || isClearingChat}
            className="p-2.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400 disabled:hover:border-transparent"
            aria-label="Delete chat"
            title="Delete chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {showInfo && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 text-sm text-zinc-300 shadow-2xl backdrop-blur-xl"
              >
                <p className="font-bold text-white">Knowledge Assistant</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Answers are generated from the latest uploaded Knowledge Base documents. The delete button clears this chat history only.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth" ref={scrollRef}>
        {messages.length === 0 && !isTyping && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-6 rounded-3xl mb-6 border border-white/10 shadow-[0_0_30px_rgba(168,85,247,0.15)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-white/10 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <Sparkles className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-2xl font-extrabold text-white mb-2 tracking-tight">Hello! How can I help you?</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              I can answer questions based on the documents you've uploaded to the Knowledge Base. Try asking about a specific topic.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg border ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-300 border-white/10' : 'bg-gradient-to-br from-purple-500 to-blue-600 text-white border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
              }`}>
              {msg.role === 'user' ? <UserIcon className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              <div className={`p-4 leading-relaxed text-sm backdrop-blur-md ${msg.role === 'user'
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-3xl rounded-tr-sm shadow-[0_0_20px_rgba(168,85,247,0.2)] border border-white/10'
                  : 'bg-zinc-900/80 border border-white/10 text-zinc-200 rounded-3xl rounded-tl-sm shadow-lg'
                }`}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <ReactMarkdown
                    components={{
                      ul: ({ node, ...props }) => <ul className="list-disc ml-5 space-y-1 my-2" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal ml-5 space-y-1 my-2" {...props} />,
                      li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                      p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-extrabold text-white underline decoration-purple-500/50 decoration-2 underline-offset-4" {...props} />,
                      h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-white mt-4 mb-2" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-base font-bold text-white mt-3 mb-2" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-white mt-2 mb-1" {...props} />
                    }}
                  >
                    {msg.content
                      ? msg.content
                          .replace(/\s([*-])\s/g, '\n\n$1 ')
                          .replace(/\s(\d+\.)\s/g, '\n\n$1 ')
                          .replace(/([.?!])\s+(\*\*)/g, '$1\n\n$2')
                      : ""}
                  </ReactMarkdown>
                )}
              </div>
              <div className="text-[10px] text-zinc-500 font-bold px-2 tracking-wider">
                {msg.createdAt?.toDate?.() ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
              </div>
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-4"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.3)] border border-purple-500/50">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 p-5 rounded-3xl rounded-tl-sm flex items-center gap-2 shadow-lg">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '200ms' }}></div>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(16,185,129,0.8)]" style={{ animationDelay: '400ms' }}></div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="p-5 border-t border-white/5 bg-zinc-900/60 backdrop-blur-md">
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex gap-3 group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder="Ask a question about your documents..."
            className="relative flex-1 bg-zinc-950 border border-white/10 focus:border-purple-500/50 text-white text-sm py-4 px-6 rounded-2xl transition-all outline-none placeholder:text-zinc-500 shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="relative bg-white text-black p-4 rounded-2xl hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center justify-center"
          >
            {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
        <p className="text-[10px] text-zinc-500 text-center mt-4 font-bold uppercase tracking-widest">
          Gemini AI can provide sources and context from your Knowledge Base
        </p>
      </div>
    </div>
  );
}
