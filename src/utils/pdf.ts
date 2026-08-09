import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const extractTextFromPdf = async (
  arrayBuffer: ArrayBuffer,
  mode: "text" | "ai",
  llmProvider?: string,
  llmModel?: string,
  llmApiKey?: string,
  llmBaseUrl?: string,
): Promise<string> => {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

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

    if (mode === "ai") {
      const systemPrompt = `You are a document parser. Format the following raw page text into clean, structured Markdown. Reconstruct headers (#, ##, ###), lists, tables, and paragraphs where appropriate. Do NOT add conversational filler (like "Here is the markdown..."). Just output the raw Markdown content.\n\nPage Text:\n${pageText}`;
      try {
        const formattedPage = await invoke<string>("orchestrate_agent", {
          prompt: systemPrompt,
          provider: llmProvider || "local",
          model: llmModel || "",
          apiKey: llmApiKey || null,
          baseUrl: llmBaseUrl || null,
          activeNoteId: null,
        });
        fullText += `# Page ${i}\n\n${formattedPage}\n\n`;
      } catch (err) {
        console.error(`AI formatting failed for page ${i}, falling back to raw text.`, err);
        fullText += `# Page ${i} (Raw)\n\n${pageText}\n\n`;
      }
    } else {
      fullText += `# Page ${i}\n\n${pageText}\n\n`;
    }
  }
  return fullText;
};
