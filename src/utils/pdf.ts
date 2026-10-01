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

const BREAKOUT_PREFIX_REGEX = /^(SIDEBAR|EXAMPLE|NOTE|TIP|WARNING|CAUTION|IMPORTANT|OPTIONAL RULE|RULE VARIANT)[:-]\s*(.*)$/i;

const CALLOUT_TYPE_MAP: Record<string, string> = {
  sidebar: "NOTE",
  example: "EXAMPLE",
  note: "NOTE",
  tip: "TIP",
  warning: "WARNING",
  caution: "CAUTION",
  important: "IMPORTANT",
  "optional rule": "NOTE",
  "rule variant": "NOTE",
};

/**
 * Parses consecutive lines of tabular data separated by 2+ spaces or tabs
 * and converts them into GFM pipe tables.
 */
export const formatTables = (lines: string[]): string[] => {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Check if line looks like existing markdown table
    if (line.trim().startsWith("|")) {
      result.push(line);
      i++;
      continue;
    }

    const cells = line.trim().split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);

    // Candidate table header must have at least 2 cells
    if (cells.length >= 2 && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextCells = nextLine.trim().split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);

      // Check if next row also has columns (within +/- 1 column count)
      if (nextCells.length >= 2 && Math.abs(cells.length - nextCells.length) <= 1) {
        const numCols = Math.max(cells.length, nextCells.length);
        const padCells = (cList: string[]) => {
          const padded = [...cList];
          while (padded.length < numCols) padded.push("");
          return padded;
        };

        const headerRow = `| ${padCells(cells).join(" | ")} |`;
        const separatorRow = `| ${Array(numCols).fill(":---").join(" | ")} |`;
        result.push(headerRow);
        result.push(separatorRow);

        let tableRowIndex = i + 1;
        while (tableRowIndex < lines.length) {
          const rowText = lines[tableRowIndex];
          if (!rowText.trim()) break;
          const rowCells = rowText.trim().split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);
          if (rowCells.length < 2 && Math.abs(rowCells.length - numCols) > 1) {
            break;
          }
          result.push(`| ${padCells(rowCells).join(" | ")} |`);
          tableRowIndex++;
        }

        i = tableRowIndex;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result;
};

/**
 * Detects rulebook breakout boxes and sidebars and transforms them into
 * Obsidian Callouts (> [!NOTE], > [!EXAMPLE], etc.).
 */
export const formatBreakouts = (lines: string[]): string[] => {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const match = BREAKOUT_PREFIX_REGEX.exec(trimmed);

    if (match) {
      const rawPrefix = match[1].toLowerCase();
      const calloutType = CALLOUT_TYPE_MAP[rawPrefix] || "NOTE";
      const customTitle = match[2]?.trim() || (rawPrefix.charAt(0).toUpperCase() + rawPrefix.slice(1));

      result.push(`> [!${calloutType}] ${customTitle}`);

      let bodyIdx = i + 1;
      while (bodyIdx < lines.length) {
        const bodyLine = lines[bodyIdx];
        if (!bodyLine.trim()) break;
        // If a new breakout or a header begins, stop callout
        if (BREAKOUT_PREFIX_REGEX.test(bodyLine.trim()) || /^#{1,6}\s/.test(bodyLine.trim())) {
          break;
        }
        result.push(`> ${bodyLine.trim()}`);
        bodyIdx++;
      }

      i = bodyIdx;
      continue;
    }

    result.push(line);
    i++;
  }

  return result;
};

/**
 * Local markdown-ification for raw PDF text with table and breakout detection.
 */
export const rawToMarkdown = (text: string): string => {
  // Pass 1: Line-by-line normalization
  const rawLines = text.split("\n");
  const breakoutFormatted = formatBreakouts(rawLines);
  const tableFormatted = formatTables(breakoutFormatted);

  const out: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push("");
      inList = false;
    }
  };

  const ensureBlankBefore = () => {
    if (out.length > 0 && out[out.length - 1] !== "") {
      out.push("");
    }
  };

  for (const rawLine of tableFormatted) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      out.push("");
      continue;
    }
    const trimmed = line.trim();

    // Already a blockquote / callout
    if (trimmed.startsWith(">")) {
      flushList();
      out.push(trimmed);
      continue;
    }

    // Already a table row
    if (trimmed.startsWith("|")) {
      flushList();
      out.push(trimmed);
      continue;
    }

    // Bullet-like lines → markdown list items.
    if (/^[+\-*•]\s+/.test(trimmed)) {
      if (!inList) {
        ensureBlankBefore();
        inList = true;
      }
      out.push(`- ${trimmed.replace(/^[+\-*•]\s+/, "")}`);
      continue;
    }
    flushList();

    // Short all-caps lines → headers (rulebook section labels).
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 60 &&
      /^[A-Z][A-Z0-9\s&'’\-–—:()/?!]+$/.test(trimmed)
    ) {
      out.push(`## ${trimmed}`);
      continue;
    }

    out.push(line);
  }
  flushList();

  while (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }
  return out.join("\n");
};

/**
 * Partitions page items into multi-column flow if a distinct multi-column layout exists.
 */
const partitionPageColumns = (items: any[]): any[][] => {
  if (items.length < 4) return [items];

  const xs = items.map((it) => it.transform[4]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (maxX - minX < 200) return [items];

  const mid = (minX + maxX) / 2;
  const leftItems = items.filter((it) => it.transform[4] < mid - 20);
  const rightItems = items.filter((it) => it.transform[4] > mid + 20);
  const crossingItems = items.filter(
    (it) => it.transform[4] >= mid - 20 && it.transform[4] <= mid + 20,
  );

  // If both columns contain multiple items and there's a clear center gutter
  if (leftItems.length >= 2 && rightItems.length >= 2 && crossingItems.length <= 1) {
    return [leftItems, rightItems];
  }

  return [items];
};

/**
 * Converts a set of items within a column flow into ordered lines of text.
 */
const columnItemsToText = (items: any[]): string => {
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
  let colText = "";

  for (const y of sortedKeys) {
    const lineItems = linesMap.get(y)!;
    lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
    const lineStr = lineItems.map((item) => item.str).join(" ");
    colText += lineStr + "\n";
  }

  return colText;
};

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
    // pdfjs-dist 6.x streamTextContent reading via getReader() for Safari/WKWebView compatibility.
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

    // Partition into multi-column reading flow
    const columns = partitionPageColumns(items);
    let pageText = "";

    for (const colItems of columns) {
      pageText += columnItemsToText(colItems);
    }

    if (pageText.trim() === "") continue;
    pages.push({ num: i, text: pageText });
    onProgress?.({ phase: "pages", processed: pages.length, total: pdf.numPages });
  }

  if (mode !== "ai") {
    return pages
      .map(({ num, text }) => `# Page ${num}\n\n${rawToMarkdown(text)}`)
      .join("\n");
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
    `You are an expert tabletop RPG rulebook and document parser. Format the following raw pages of a PDF into high-fidelity, clean Markdown adhering to GitHub-Flavored Markdown (GFM) and Obsidian-Flavored Markdown (OFM):
- Multi-column flow: Reconstruct the logical reading order across columns.
- Tables: Convert all tabular statblocks, class progressions, equipment lists, and charts into standard GFM pipe tables with aligned columns (| Col 1 | Col 2 | and | :--- | :--- |).
- Sidebars & Breakouts: Convert rulebook sidebars, designer notes, optional rules, and examples into Obsidian callouts:
  > [!NOTE] Title
  > [!TIP] Title
  > [!EXAMPLE] Title
  > [!WARNING] Title
- Headings: Reconstruct semantic hierarchy (# for document/page title, ## for major chapter/topic, ### for section, #### for statblock/subheading).
- Lists: Format bullet lists (- ) and numbered lists (1. ) properly.
- Keep every page's content under its exact "# Page N" heading verbatim.
- Do NOT add conversational preamble or markdown code fence around the whole response. Just output the structured Markdown content.\n\n${batch
      .map(({ num, text }) => `# Page ${num}\n${text}`)
      .join("\n\n")}`;

  const rawFallback = (batch: { num: number; text: string }[]) =>
    batch.map(({ num, text }) => `# Page ${num} (Raw)\n\n${rawToMarkdown(text)}`).join("\n");

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
