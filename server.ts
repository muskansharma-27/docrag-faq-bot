import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type DocumentContext = {
  title?: string;
  content?: string;
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const buildDocumentContext = (documents: DocumentContext[] = []) =>
  documents
    .map((document, index) => {
      const title = normalizeText(document.title || `Document ${index + 1}`);
      const content = normalizeText(document.content || "");
      return content ? `[Source ${index + 1}: ${title}]\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 24000);

const buildExtractiveAnswer = (question: string, documents: DocumentContext[] = []) => {
  const questionTerms = new Set(
    question
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 2) || []
  );

  const ranked = documents
    .map((document) => {
      const content = normalizeText(document.content || "");
      const haystack = `${document.title || ""} ${content}`.toLowerCase();
      const score = [...questionTerms].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { title: document.title || "Uploaded document", content, score };
    })
    .filter((document) => document.content)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return "I could not find readable text in the uploaded documents yet. Re-upload a text-based document, or configure GEMINI_API_KEY for scanned PDFs.";
  }

  const snippets = ranked
    .map((document) => `**${document.title}**\n${document.content.slice(0, 900)}${document.content.length > 900 ? "..." : ""}`)
    .join("\n\n");

  return `I found these relevant passages in your uploaded documents. Add GEMINI_API_KEY for a more natural synthesized answer.\n\n${snippets}`;
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3001);

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Analytics mock/aggregator endpoint
  app.get("/api/analytics", (req, res) => {
    // In a real app, this would query Firestore. For now, returning dummy data for the chart.
    const data = [
      { date: "2026-04-12", queries: 45, accuracy: 0.88 },
      { date: "2026-04-13", queries: 52, accuracy: 0.91 },
      { date: "2026-04-14", queries: 38, accuracy: 0.85 },
      { date: "2026-04-15", queries: 65, accuracy: 0.94 },
      { date: "2026-04-16", queries: 48, accuracy: 0.90 },
      { date: "2026-04-17", queries: 72, accuracy: 0.92 },
      { date: "2026-04-18", queries: 55, accuracy: 0.89 },
    ];
    res.json(data);
  });

  // Role Management mock
  app.get("/api/user/role", (req, res) => {
     // In a real app, verify Firebase Token
     res.json({ role: "admin" }); 
  });

  app.post("/api/extract-pdf", express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "20mb" }), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "No GEMINI_API_KEY is configured, so image-based PDF extraction is unavailable.",
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "No PDF data received." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Extract all readable text from this PDF for a knowledge base. Return only the extracted text, preserving important labels, amounts, dates, and line breaks. If no text is readable, return an empty string.",
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: req.body.toString("base64"),
                },
              },
            ],
          },
        ],
      });

      res.json({ text: (response.text || "").trim() });
    } catch (error: any) {
      console.error("PDF AI extraction error:", error);
      res.status(500).json({ error: error.message || "Failed to extract PDF text." });
    }
  });

  // Chat over uploaded Knowledge Base context
  app.post("/api/chat", async (req, res) => {
    try {
      // Intercept basic greetings to avoid hitting the RAG workflow for simple "hi"
      const userMessage = req.body.question || "";
      const cleanMessage = userMessage.trim().replace(/[.,!?'"]/g, "").toLowerCase();
      const greetingsPattern = /^(hi|hello|hey|hlo|hy|hyee|heyo|hola|greetings|good morning|good afternoon|good evening)(?:\s+(there|bot|assistant|friend))?$/i;
      
      if (greetingsPattern.test(cleanMessage)) {
        return res.json({ 
          answer: "Hello! 👋 I am your Knowledge Assistant. I can answer questions about the HR policies and product guides. What would you like to know?" 
        });
      }

      const documents = Array.isArray(req.body.documents) ? req.body.documents as DocumentContext[] : [];
      const context = buildDocumentContext(documents);

      if (!context) {
        return res.json({
          answer: "I do not have readable document content yet. Upload a document with extractable text first, then ask again.",
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ answer: buildExtractiveAnswer(userMessage, documents) });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a Knowledge Base assistant. Answer the user's question using only the uploaded document context below.

Rules:
- If the answer is present, answer clearly and cite the document title(s).
- If the context does not contain the answer, say you could not find it in the uploaded documents.
- Do not invent facts outside the context.

Question:
${userMessage}

Uploaded document context:
${context}`,
              },
            ],
          },
        ],
      });

      res.json({ answer: response.text || "I could not generate an answer from the uploaded documents." });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ answer: `Error answering from documents: ${error.message}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});
