import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// AI-mode batching: pages are sent to the LLM in groups instead of one call
// per page, so a large PDF is N calls instead of numPages calls. The batch is
// bounded by page count AND raw-text size so small-context models don't blow up.
const AI_BATCH_PAGES = 10;
const AI_BATCH_CHARS = 30_000;

export interface PdfProgress {
  /** "pages" fires as raw text is extracted from each page; "batches" fires as AI-mode LLM batches complete. */
  phase: "pages" | "batches";
  processed: number;
  total: number;
}

export const extractTextFromPdf = async (
  arrayBuffer: ArrayBuffer,
  mode: "text" | "ai",
  llmProvider?: string,
  llmModel?: string,
  llmApiKey?: string,
  llmBaseUrl?: string,
  onProgress?: (progress: PdfProgress) => void,
): Promise<string> => {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: { num: number; text: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // pdfjs-dist 6.x getTextContent() iterates the text stream with `for await...of`,
    // which throws "undefined is not a function (near '...t of e...')" in Safari/WKWebView
    // (Tauri's macOS webview) because ReadableStream.prototype[Symbol.asyncIterator]
    // is not implemented there. Consume the stream via getReader() instead.
    // See mozilla/pdf.js#21557 / #20973.
    const reader = page.streamTextContent().getReader();
    const items: any[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const item of value.items) items.push(item);
      }
    } finally {
      reader.releaseLock();
    }

    const linesMap = new Map<number, any[]>();
    for (const item of items) {
      if (!item.str || item.str.trim() === "") continue;
      const y = Math.round(item.transform[5]);
      let foundKey = y;
      for (const key of linesMap.keys()) {
        if (Math.abs(key - y) <= 4) {
          foundKey = key;
          break;
        }
      }
      if (!linesMap.has(foundKey)) {
        linesMap.set(foundKey, []);
      }
      linesMap.get(foundKey)!.push(item);
    }

    const sortedKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
    let pageText = "";

    for (const y of sortedKeys) {
      const lineItems = linesMap.get(y)!;
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const lineStr = lineItems.map((item) => item.str).join(" ");
      pageText += lineStr + "\n";
    }

    if (pageText.trim() === "") continue;
    pages.push({ num: i, text: pageText });
    onProgress?.({ phase: "pages", processed: pages.length, total: pdf.numPages });
  }

  if (mode !== "ai") {
    return pages.map(({ num, text }) => `# Page ${num}\n\n${text}`).join("\n");
  }

  // AI mode: group consecutive pages into batches, one LLM call per batch.
  const batches: { num: number; text: string }[][] = [];
  let current: { num: number; text: string }[] = [];
  let chars = 0;
  for (const p of pages) {
    if (
      current.length >= AI_BATCH_PAGES ||
      (current.length > 0 && chars + p.text.length > AI_BATCH_CHARS)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(p);
    chars += p.text.length;
  }
  if (current.length > 0) batches.push(current);

  const systemPrompt = (batch: { num: number; text: string }[]) =>
    `You are a document parser. Format the following raw pages of a PDF into clean, structured Markdown. Reconstruct headers (#, ##, ###), lists, tables, and paragraphs where appropriate. Keep every page's content under its exact "# Page N" heading. Do NOT add conversational filler. Just output the raw Markdown content.\n\n${batch
      .map(({ num, text }) => `# Page ${num}\n${text}`)
      .join("\n\n")}`;

  const rawFallback = (batch: { num: number; text: string }[]) =>
    batch.map(({ num, text }) => `# Page ${num} (Raw)\n\n${text}`).join("\n");

  let fullText = "";
  let batchDone = 0;
  for (const batch of batches) {
    try {
      const formattedPage = await invoke<string>("orchestrate_agent", {
        prompt: systemPrompt(batch),
        provider: llmProvider || "local",
        model: llmModel || "",
        apiKey: llmApiKey || null,
        baseUrl: llmBaseUrl || null,
        activeNoteId: null,
      });
      // The model must preserve every expected "# Page N" heading verbatim —
      // otherwise we can't attribute content to pages, so fall back to raw.
      const expectedHeaders = batch.map(({ num }) => `# Page ${num}`);
      if (expectedHeaders.every((h) => formattedPage.includes(h))) {
        fullText += formattedPage.trim() + "\n\n";
      } else {
        console.error(
          `AI formatting for pages ${batch.map((b) => b.num).join(", ")} dropped expected page headers, falling back to raw text.`,
        );
        fullText += rawFallback(batch) + "\n\n";
      }
    } catch (err) {
      console.error(
        `AI formatting failed for pages ${batch.map((b) => b.num).join(", ")}, falling back to raw text.`,
        err,
      );
      fullText += rawFallback(batch) + "\n\n";
    }
    batchDone += 1;
    onProgress?.({ phase: "batches", processed: batchDone, total: batches.length });
  }
  return fullText;
};
