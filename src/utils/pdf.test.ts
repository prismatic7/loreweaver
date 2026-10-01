import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractTextFromPdf, rawToMarkdown } from "./pdf";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Avoid Vite building the real 1MB+ worker for unit tests.
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?worker&url", () => ({
  default: "mock-worker-url",
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

import * as pdfjsLib from "pdfjs-dist";
const getDocumentMock = vi.mocked(pdfjsLib.getDocument);

// Minimal stand-in for the `ReadableStream` returned by
// `PDFPageProxy.streamTextContent()`. Real streams (and jsdom) may not expose
// `Symbol.asyncIterator` on `ReadableStream` — which is exactly the Safari
// bug the production code works around by consuming via `getReader()`.
function makeStream(
  chunks: Array<{ items: any[]; styles?: object; lang?: string | null }>,
) {
  let idx = 0;
  return {
    getReader: () => ({
      read: async () =>
        idx < chunks.length
          ? { done: false, value: chunks[idx++] }
          : { done: true, value: undefined },
      releaseLock: () => {},
    }),
  };
}

const textItem = (str: string, x: number, y: number) => ({
  str,
  transform: [1, 0, 0, 1, x, y],
});

function mockPdf(numPages: number) {
  getDocumentMock.mockReturnValue({
    promise: Promise.resolve({
      numPages,
      getPage: async (n: number) => ({
        streamTextContent: () =>
          makeStream([{ items: [textItem(`Page ${n} content`, 10, 100)] }]),
      }),
    }),
  } as never);
}

const buf = () => new Uint8Array([1, 2, 3]).buffer;

describe("rawToMarkdown", () => {
  it("promotes short all-caps lines to headers", () => {
    const out = rawToMarkdown("SKILLS\nStart with one Great (+4).");
    expect(out).toContain("## SKILLS");
    expect(out).toContain("Start with one Great (+4).");
  });

  it("converts bullet-like lines to markdown list items", () => {
    const out = rawToMarkdown("+ Academics\n+ Athletics\n- Empathy");
    expect(out).toContain("- Academics");
    expect(out).toContain("- Athletics");
    expect(out).toContain("- Empathy");
  });

  it("leaves existing markdown untouched", () => {
    const md = "# Fireball\n\n**Damage:** 8d6\n\n- Range: 120 ft";
    expect(rawToMarkdown(md)).toBe(md);
  });

  it("does not promote long or mixed-case lines", () => {
    const out = rawToMarkdown(
      "This is a long sentence that should never become a header because it is far too long to be a section label.",
    );
    expect(out).not.toContain("## ");
  });

  it("detects multi-column tabular data and formats as GFM table", () => {
    const input = "Level    Proficiency    Features\n1st      +2             Spellcasting\n2nd      +2             Tradition";
    const out = rawToMarkdown(input);
    expect(out).toContain("| Level | Proficiency | Features |");
    expect(out).toContain("| :--- | :--- | :--- |");
    expect(out).toContain("| 1st | +2 | Spellcasting |");
    expect(out).toContain("| 2nd | +2 | Tradition |");
  });

  it("detects rulebook sidebars and converts to Obsidian callouts", () => {
    const input = "SIDEBAR: Variant Resting Rules\nCharacters only regain hit dice in a haven.\nShort rests take 8 hours.";
    const out = rawToMarkdown(input);
    expect(out).toContain("> [!NOTE] Variant Resting Rules");
    expect(out).toContain("> Characters only regain hit dice in a haven.");
    expect(out).toContain("> Short rests take 8 hours.");
  });

  it("detects example breakout boxes and converts to Obsidian example callout", () => {
    const input = "EXAMPLE: Counterspell\nTheron casts counterspell.\nHe rolls an ability check.";
    const out = rawToMarkdown(input);
    expect(out).toContain("> [!EXAMPLE] Counterspell");
    expect(out).toContain("> Theron casts counterspell.");
    expect(out).toContain("> He rolls an ability check.");
  });
});

describe("extractTextFromPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("text mode: aggregates chunks across the stream and reconstructs lines", async () => {
    // Same baseline y (100) with different x → one line, joined by space.
    // Different y (50) → separate line. Two chunks test the accumulation loop.
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          streamTextContent: () =>
            makeStream([
              { items: [textItem("Hello", 10, 100)], styles: {}, lang: "en" },
              {
                items: [textItem("World", 40, 100), textItem("Second", 10, 50)],
                styles: {},
                lang: "en",
              },
            ]),
        }),
      }),
    } as never);

    const text = await extractTextFromPdf(buf(), "text");

    expect(text).toContain("# Page 1");
    const helloIdx = text.indexOf("Hello World");
    const secondIdx = text.indexOf("Second");
    expect(helloIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(helloIdx);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("text mode: reconstructs two-column layouts in logical reading order rather than horizontal slicing", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          streamTextContent: () =>
            makeStream([
              {
                items: [
                  textItem("Left Col Line 1", 50, 500),
                  textItem("Right Col Line 1", 350, 500),
                  textItem("Left Col Line 2", 50, 480),
                  textItem("Right Col Line 2", 350, 480),
                ],
                styles: {},
                lang: "en",
              },
            ]),
        }),
      }),
    } as never);

    const text = await extractTextFromPdf(buf(), "text");
    const left2Idx = text.indexOf("Left Col Line 2");
    const right1Idx = text.indexOf("Right Col Line 1");
    expect(left2Idx).toBeGreaterThan(-1);
    expect(right1Idx).toBeGreaterThan(-1);
    expect(left2Idx).toBeLessThan(right1Idx);
  });

  it("text mode: runs zero LLM calls and headers the pages", async () => {
    mockPdf(2);
    const text = await extractTextFromPdf(buf(), "text");
    expect(text).toContain("# Page 1");
    expect(text).toContain("# Page 2");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ai mode: one batched LLM call for multiple pages, with provider config", async () => {
    invokeMock.mockResolvedValue("# Page 1\n**Clean 1**\n\n# Page 2\n**Clean 2**");
    mockPdf(2);

    const text = await extractTextFromPdf(
      buf(),
      "ai",
      "openai",
      "gpt-4o",
      "sk-test",
      "https://api.example.com",
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0][1] as Record<string, unknown>;
    expect(call.provider).toBe("openai");
    expect(call.model).toBe("gpt-4o");
    expect(call.apiKey).toBe("sk-test");
    expect(call.baseUrl).toBe("https://api.example.com");
    expect(call.activeNoteId).toBeNull();
    expect(call.prompt as string).toContain("# Page 1");
    expect(call.prompt as string).toContain("# Page 2");
    expect(text).toContain("# Page 1");
    expect(text).toContain("# Page 2");
    expect(text).toContain("**Clean 1**");
    expect(text).not.toContain("(Raw)");
  });

  it("ai mode: splits into multiple batches past the 10-page cap", async () => {
    invokeMock.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => `# Page ${i + 1}\n**Clean ${i + 1}**`).join("\n\n"),
    );
    mockPdf(11);

    const text = await extractTextFromPdf(buf(), "ai");

    expect(invokeMock).toHaveBeenCalledTimes(2);
    const firstPrompt = invokeMock.mock.calls[0][1].prompt as string;
    const secondPrompt = invokeMock.mock.calls[1][1].prompt as string;
    expect(firstPrompt).toContain("# Page 1");
    expect(firstPrompt).toContain("# Page 10");
    expect(firstPrompt).not.toContain("# Page 11");
    expect(secondPrompt).toContain("# Page 11");
    expect(text).toContain("# Page 1");
    expect(text).toContain("# Page 11");
    expect(text).not.toContain("(Raw)");
  });

  it("ai mode: falls back to raw text when the LLM call fails", async () => {
    invokeMock.mockRejectedValue(new Error("LLM unavailable"));
    mockPdf(1);

    const text = await extractTextFromPdf(buf(), "ai");

    expect(text).toContain("# Page 1 (Raw)");
    expect(text).toContain("Page 1 content");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("ai mode: falls back to raw text when the model drops page headers", async () => {
    // Model returns markdown but omits "# Page 2" → cannot attribute pages, raw fallback.
    invokeMock.mockResolvedValue("# Page 1\n**Clean 1**");
    mockPdf(2);

    const text = await extractTextFromPdf(buf(), "ai");

    expect(text).toContain("# Page 1 (Raw)");
    expect(text).toContain("# Page 2 (Raw)");
  });

  it("text mode: reports page-level progress via onProgress", async () => {
    mockPdf(3);
    const progress: Array<{ phase: string; processed: number; total: number }> = [];
    await extractTextFromPdf(buf(), "text", undefined, undefined, undefined, undefined, (p) =>
      progress.push(p),
    );

    expect(progress).toEqual([
      { phase: "pages", processed: 1, total: 3 },
      { phase: "pages", processed: 2, total: 3 },
      { phase: "pages", processed: 3, total: 3 },
    ]);
  });

  it("ai mode: reports page progress, then batch progress once per batch", async () => {
    invokeMock.mockResolvedValue("# Page 1\n**Clean 1**");
    mockPdf(11); // 11 pages > AI_BATCH_PAGES=10 → two batches.

    const progress: Array<{ phase: string; processed: number; total: number }> = [];
    await extractTextFromPdf(buf(), "ai", undefined, undefined, undefined, undefined, (p) =>
      progress.push(p),
    );

    const pagePhase = progress.filter((p) => p.phase === "pages");
    expect(pagePhase).toHaveLength(11);
    expect(pagePhase[0]).toEqual({ phase: "pages", processed: 1, total: 11 });
    expect(pagePhase[10]).toEqual({ phase: "pages", processed: 11, total: 11 });

    const batchPhase = progress.filter((p) => p.phase === "batches");
    expect(batchPhase).toEqual([
      { phase: "batches", processed: 1, total: 2 },
      { phase: "batches", processed: 2, total: 2 },
    ]);
  });
});

describe("PDF Outline and Auto-Chunking", () => {
  it("sanitizeFileName removes illegal filesystem characters", async () => {
    const { sanitizeFileName } = await import("./pdf");
    expect(sanitizeFileName("Chapter 1: Combat & Tactics / Skills?")).toBe(
      "Chapter 1 Combat & Tactics Skills"
    );
    expect(sanitizeFileName("Evil <Demon> *Boss*")).toBe("Evil Demon Boss");
  });

  it("detectOutlineFromPages extracts chapter and header patterns from raw pages", async () => {
    const { detectOutlineFromPages } = await import("./pdf");
    const pages = [
      { num: 1, text: "Welcome to the game\nCopyright 2026" },
      { num: 2, text: "Chapter 1: Character Creation\nRoll your stats" },
      { num: 5, text: "Chapter 2: Equipment\nArmor and weapons" },
      { num: 8, text: "# Appendix A: Bestiary\nGoblins and Dragons" },
    ];

    const outline = detectOutlineFromPages(pages);
    expect(outline).toHaveLength(3);
    expect(outline[0]).toEqual({
      title: "Chapter 1: Character Creation",
      pageNumber: 2,
      level: 0,
    });
    expect(outline[1]).toEqual({
      title: "Chapter 2: Equipment",
      pageNumber: 5,
      level: 0,
    });
    expect(outline[2]).toEqual({
      title: "Appendix A: Bestiary",
      pageNumber: 8,
      level: 0,
    });
  });

  it("chunkPdfByOutline chunks pages into nested folders and notes", async () => {
    const { chunkPdfByOutline } = await import("./pdf");

    // Mock PDF with outline
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 6,
        getPage: async (n: number) => ({
          streamTextContent: () =>
            makeStream([{ items: [textItem(`Content of page ${n}`, 10, 100)] }]),
        }),
        getOutline: async () => [
          {
            title: "Chapter 1: The Beginning",
            dest: [0], // 0-indexed page 0 -> page 1
            items: [
              {
                title: "Races",
                dest: [1], // page 2
              },
              {
                title: "Classes",
                dest: [3], // page 4
              },
            ],
          },
          {
            title: "Chapter 2: Magic",
            dest: [4], // page 5
          },
        ],
        getPageIndex: async (ref: any) => (typeof ref === "number" ? ref : 0),
      }),
    } as never);

    const chunks = await chunkPdfByOutline(buf(), {
      sourceName: "FantasySRD",
      baseFolder: "Rules/FantasySRD",
      mode: "text",
    });

    expect(chunks.length).toBeGreaterThanOrEqual(4);

    // Chapter 1 overview (page 1)
    expect(chunks.some((c) => c.fullPath.includes("01 - Chapter 1 The Beginning/00 - Overview.md"))).toBe(true);

    // Chapter 1 Races (pages 2-3)
    const racesChunk = chunks.find((c) => c.title === "Races");
    expect(racesChunk).toBeDefined();
    expect(racesChunk?.startPage).toBe(2);
    expect(racesChunk?.endPage).toBe(3);
    expect(racesChunk?.content).toContain('title: "Races"');
    expect(racesChunk?.content).toContain("Page 2");

    // Chapter 1 Classes (page 4)
    const classesChunk = chunks.find((c) => c.title === "Classes");
    expect(classesChunk).toBeDefined();
    expect(classesChunk?.startPage).toBe(4);
    expect(classesChunk?.endPage).toBe(4);

    // Chapter 2 Magic (pages 5-6)
    const magicChunk = chunks.find((c) => c.title === "Chapter 2: Magic");
    expect(magicChunk).toBeDefined();
    expect(magicChunk?.startPage).toBe(5);
    expect(magicChunk?.endPage).toBe(6);
  });
});
