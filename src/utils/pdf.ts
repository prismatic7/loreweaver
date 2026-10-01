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

/**
 * Extracts raw page contents from a PDFDocumentProxy, reading each page stream
 * and assembling multi-column text.
 */
export const extractRawPages = async (
  pdf: any,
  onProgress?: (progress: PdfProgress) => void,
): Promise<{ num: number; text: string }[]> => {
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

  return pages;
};

const buildAiBatchPrompt = (batch: { num: number; text: string }[]) =>
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
  const pages = await extractRawPages(pdf, onProgress);

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

  const rawFallback = (batch: { num: number; text: string }[]) =>
    batch.map(({ num, text }) => `# Page ${num} (Raw)\n\n${rawToMarkdown(text)}`).join("\n");

  let fullText = "";
  let batchDone = 0;
  for (const batch of batches) {
    try {
      const formattedPage = await invoke<string>("orchestrate_agent", {
        prompt: buildAiBatchPrompt(batch),
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

export interface PdfOutlineItem {
  title: string;
  pageNumber: number;
  level: number;
  items?: PdfOutlineItem[];
}

export interface ChunkedChapter {
  title: string;
  folderPath: string;
  fileName: string;
  fullPath: string;
  content: string;
  startPage: number;
  endPage: number;
}

export interface ChunkPdfOptions {
  mode?: "text" | "ai";
  baseFolder?: string;
  sourceName?: string;
  llmProvider?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  onProgress?: (progress: PdfProgress) => void;
}

/**
 * Resolves a PDF destination reference to a 1-indexed page number.
 */
export const resolvePdfDestinationPage = async (
  pdf: any,
  dest: any,
): Promise<number | null> => {
  if (!dest) return null;
  try {
    let explicitDest = dest;
    if (typeof dest === "string") {
      if (typeof pdf.getDestination === "function") {
        explicitDest = await pdf.getDestination(dest);
      }
    }
    if (!explicitDest) return null;
    if (Array.isArray(explicitDest) && explicitDest.length > 0) {
      const ref = explicitDest[0];
      if (typeof ref === "number") {
        return ref + 1;
      }
      if (ref && typeof ref === "object" && typeof pdf.getPageIndex === "function") {
        const pageIdx = await pdf.getPageIndex(ref);
        return typeof pageIdx === "number" ? pageIdx + 1 : null;
      }
    }
    if (typeof explicitDest === "number") {
      return explicitDest + 1;
    }
  } catch (err) {
    console.warn("Failed to resolve PDF destination:", err);
  }
  return null;
};

/**
 * Extracts hierarchical table-of-contents / outline bookmarks from a PDF.
 */
export const extractPdfOutline = async (
  pdf: any,
): Promise<PdfOutlineItem[]> => {
  try {
    if (typeof pdf.getOutline !== "function") return [];
    const rawOutline = await pdf.getOutline();
    if (!rawOutline || !Array.isArray(rawOutline) || rawOutline.length === 0) {
      return [];
    }

    const traverse = async (
      nodes: any[],
      level: number,
    ): Promise<PdfOutlineItem[]> => {
      const result: PdfOutlineItem[] = [];
      for (const node of nodes) {
        if (!node || !node.title) continue;
        const pageNumber = await resolvePdfDestinationPage(pdf, node.dest);
        const children =
          node.items && Array.isArray(node.items) && node.items.length > 0
            ? await traverse(node.items, level + 1)
            : [];

        const resolvedPage =
          pageNumber ?? (children.length > 0 ? children[0].pageNumber : 1);

        result.push({
          title: String(node.title).trim().replace(/[\r\n\t]+/g, " "),
          pageNumber: resolvedPage,
          level,
          items: children,
        });
      }
      return result;
    };

    return await traverse(rawOutline, 0);
  } catch (err) {
    console.warn("Error extracting PDF outline:", err);
    return [];
  }
};

/**
 * Fallback outline detector when PDF lacks an embedded TOC outline.
 * Scans page headers for Chapter / Part / Book patterns.
 */
export const detectOutlineFromPages = (
  pages: { num: number; text: string }[],
): PdfOutlineItem[] => {
  const items: PdfOutlineItem[] = [];
  const chapterRegex =
    /^(?:chapter\s+(\d+|[ivxlcdm]+)|part\s+(\d+|[ivxlcdm]+)|book\s+(\d+|[ivxlcdm]+)|appendix\s+([a-z\d]+))[:.\s-]*(.*)$/im;
  const majorHeaderRegex = /^#\s+(.+)$/m;

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).slice(0, 10);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const chapMatch = line.match(chapterRegex);
      if (chapMatch) {
        const title = line.replace(/^[#\s*_-]+|[#\s*_-]+$/g, "").trim();
        items.push({
          title,
          pageNumber: page.num,
          level: 0,
        });
        break;
      }

      const h1Match = line.match(majorHeaderRegex);
      if (h1Match && !h1Match[1].toLowerCase().startsWith("page ")) {
        items.push({
          title: h1Match[1].trim(),
          pageNumber: page.num,
          level: 0,
        });
        break;
      }
    }
  }

  const seenPages = new Set<number>();
  const filtered: PdfOutlineItem[] = [];
  for (const item of items) {
    if (!seenPages.has(item.pageNumber)) {
      seenPages.add(item.pageNumber);
      filtered.push(item);
    }
  }

  return filtered;
};

/**
 * Sanitizes a title for safe filesystem folder and filename usage.
 */
export const sanitizeFileName = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*#^]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
};

const padNum = (num: number): string => String(num).padStart(2, "0");

/**
 * Auto-chunks a PDF by its TOC outline into nested chapters and notes.
 */
export const chunkPdfByOutline = async (
  arrayBuffer: ArrayBuffer,
  options: ChunkPdfOptions = {},
): Promise<ChunkedChapter[]> => {
  const {
    mode = "text",
    baseFolder = "Rules/Rulebook",
    sourceName = "Rulebook",
    llmProvider,
    llmModel,
    llmApiKey,
    llmBaseUrl,
    onProgress,
  } = options;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = await extractRawPages(pdf, onProgress);
  if (pages.length === 0) return [];

  const maxPage = pages[pages.length - 1].num;

  // 1. Extract outline or detect fallback
  let outline = await extractPdfOutline(pdf);
  if (outline.length === 0) {
    outline = detectOutlineFromPages(pages);
  }
  if (outline.length === 0) {
    outline = [{ title: sourceName, pageNumber: 1, level: 0 }];
  }

  // 2. Format pages (AI or raw markdown)
  const pageMarkdownMap: Record<number, string> = {};
  if (mode === "ai") {
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

    let batchDone = 0;
    for (const batch of batches) {
      try {
        const formatted = await invoke<string>("orchestrate_agent", {
          prompt: buildAiBatchPrompt(batch),
          provider: llmProvider || "local",
          model: llmModel || "",
          apiKey: llmApiKey || null,
          baseUrl: llmBaseUrl || null,
          activeNoteId: null,
        });
        const expectedHeaders = batch.map(({ num }) => `# Page ${num}`);
        if (expectedHeaders.every((h) => formatted.includes(h))) {
          for (let i = 0; i < batch.length; i++) {
            const num = batch[i].num;
            const startMarker = `# Page ${num}`;
            const startIdx = formatted.indexOf(startMarker);
            if (startIdx !== -1) {
              const nextMarker = i + 1 < batch.length ? `# Page ${batch[i + 1].num}` : null;
              const endIdx = nextMarker ? formatted.indexOf(nextMarker, startIdx) : -1;
              const pageContent = endIdx !== -1 ? formatted.slice(startIdx, endIdx) : formatted.slice(startIdx);
              pageMarkdownMap[num] = pageContent.trim();
            } else {
              pageMarkdownMap[num] = `# Page ${num} (Raw)\n\n${rawToMarkdown(batch[i].text)}`;
            }
          }
        } else {
          for (const b of batch) {
            pageMarkdownMap[b.num] = `# Page ${b.num} (Raw)\n\n${rawToMarkdown(b.text)}`;
          }
        }
      } catch {
        for (const b of batch) {
          pageMarkdownMap[b.num] = `# Page ${b.num} (Raw)\n\n${rawToMarkdown(b.text)}`;
        }
      }
      batchDone++;
      onProgress?.({ phase: "batches", processed: batchDone, total: batches.length });
    }
  } else {
    for (const p of pages) {
      pageMarkdownMap[p.num] = `# Page ${p.num}\n\n${rawToMarkdown(p.text)}`;
    }
  }

  const getPagesContent = (start: number, end: number): string => {
    const chunkPages = pages.filter((p) => p.num >= start && p.num <= end);
    return chunkPages
      .map((p) => pageMarkdownMap[p.num] || `# Page ${p.num}\n\n${rawToMarkdown(p.text)}`)
      .join("\n\n");
  };

  const createFrontmatter = (title: string, start: number, end: number): string => {
    return `---\ntitle: "${title.replace(/"/g, '\\"')}"\ntype: reference\nsource: "${sourceName.replace(/"/g, '\\"')}"\nstart_page: ${start}\nend_page: ${end}\ntags:\n  - rules\n  - reference\n---\n\n`;
  };

  const chunks: ChunkedChapter[] = [];

  // Preamble before first outline item if starting after page 1
  const firstPage = outline[0].pageNumber;
  if (firstPage > 1) {
    const content = getPagesContent(1, firstPage - 1);
    if (content.trim()) {
      chunks.push({
        title: "Introduction & Front Matter",
        folderPath: baseFolder,
        fileName: "00 - Introduction.md",
        fullPath: `${baseFolder}/00 - Introduction.md`,
        content: `${createFrontmatter("Introduction & Front Matter", 1, firstPage - 1)}# Introduction & Front Matter\n\n${content}`,
        startPage: 1,
        endPage: firstPage - 1,
      });
    }
  }

  // Iterate top-level outline items
  for (let i = 0; i < outline.length; i++) {
    const item = outline[i];
    const nextItem = i + 1 < outline.length ? outline[i + 1] : null;
    const chapterEndPage = nextItem ? Math.max(item.pageNumber, nextItem.pageNumber - 1) : maxPage;
    const chapIndexStr = padNum(i + 1);
    const cleanChapTitle = sanitizeFileName(item.title);

    const hasChildren = item.items && item.items.length > 0;

    if (hasChildren) {
      const chapterFolder = `${baseFolder}/${chapIndexStr} - ${cleanChapTitle}`;
      const children = item.items!;

      // Preamble before first child
      const firstChildPage = children[0].pageNumber;
      if (firstChildPage > item.pageNumber) {
        const preambleContent = getPagesContent(item.pageNumber, firstChildPage - 1);
        if (preambleContent.trim()) {
          chunks.push({
            title: `${item.title} (Overview)`,
            folderPath: chapterFolder,
            fileName: "00 - Overview.md",
            fullPath: `${chapterFolder}/00 - Overview.md`,
            content: `${createFrontmatter(`${item.title} (Overview)`, item.pageNumber, firstChildPage - 1)}# ${item.title}\n\n${preambleContent}`,
            startPage: item.pageNumber,
            endPage: firstChildPage - 1,
          });
        }
      }

      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        const nextChild = j + 1 < children.length ? children[j + 1] : null;
        const childEndPage = nextChild ? Math.max(child.pageNumber, nextChild.pageNumber - 1) : chapterEndPage;
        const childIndexStr = padNum(j + 1);
        const cleanChildTitle = sanitizeFileName(child.title);
        const fileName = `${childIndexStr} - ${cleanChildTitle}.md`;
        const content = getPagesContent(child.pageNumber, childEndPage);

        chunks.push({
          title: child.title,
          folderPath: chapterFolder,
          fileName,
          fullPath: `${chapterFolder}/${fileName}`,
          content: `${createFrontmatter(child.title, child.pageNumber, childEndPage)}# ${child.title}\n\n${content}`,
          startPage: child.pageNumber,
          endPage: childEndPage,
        });
      }
    } else {
      // Single note in base folder
      const fileName = `${chapIndexStr} - ${cleanChapTitle}.md`;
      const content = getPagesContent(item.pageNumber, chapterEndPage);

      chunks.push({
        title: item.title,
        folderPath: baseFolder,
        fileName,
        fullPath: `${baseFolder}/${fileName}`,
        content: `${createFrontmatter(item.title, item.pageNumber, chapterEndPage)}# ${item.title}\n\n${content}`,
        startPage: item.pageNumber,
        endPage: chapterEndPage,
      });
    }
  }

  return chunks;
};
