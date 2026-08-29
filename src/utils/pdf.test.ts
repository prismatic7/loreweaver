import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractTextFromPdf } from "./pdf";

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
