import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extractTextFromPdf, PdfProgress, rawToMarkdown } from "../utils/pdf";

interface UseIngestDeps {
  showToast: (message: string) => void;
  loadRules: () => Promise<void>;
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl: string;
  onProgress?: (progress: PdfProgress) => void;
}

export interface IngestDialogState {
  open: boolean;
  fileName: string;
  onSelect: ((mode: "text" | "ai") => void) | null;
}

export const useIngest = (deps: UseIngestDeps) => {
  const { showToast, loadRules, llmProvider, llmModel, llmApiKey, llmBaseUrl, onProgress } = deps;
  const [ingestDialog, setIngestDialog] = useState<IngestDialogState>({
    open: false,
    fileName: "",
    onSelect: null,
  });

  const executeSRDIngestion = useCallback(
    async (file: File, mode: "text" | "ai") => {
      const sourceName = file.name.replace(/\.[^/.]+$/, "");
      const reader = new FileReader();

      if (file.name.toLowerCase().endsWith(".pdf")) {
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) return;

          try {
            if (mode === "ai") {
              showToast(
                "Starting AI Markdown ingestion... Pages are being processed in batches by your LLM. Progress will appear in the bottom-right corner.",
              );
            } else {
              showToast("Extracting text locally...");
            }

            const content = await extractTextFromPdf(
              arrayBuffer,
              mode,
              llmProvider,
              llmModel,
              llmApiKey,
              llmBaseUrl,
              onProgress,
            );

            invoke("ingest_srd_text", {
              category: "Reference",
              source: sourceName,
              content,
            })
              .then(() => loadRules())
              .then(() => {
                showToast(
                  `Successfully ingested "${file.name}" with ${mode === "ai" ? "AI parsing" : "raw text extraction"} and generated local semantic vector search chunks!`,
                );
              })
              .catch((err) => {
                console.error("Failed to ingest SRD:", err);
                showToast("Error during SRD ingestion: " + err);
              });
          } catch (err: any) {
            console.error("PDF Ingestion failed:", err);
            showToast("Failed to parse PDF: " + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = async (event) => {
          const rawContent = event.target?.result as string;
          if (!rawContent) return;

          try {
            let content = rawContent;
            if (mode === "ai") {
              showToast("Starting AI Markdown ingestion... Processing file content through your LLM.");
              const systemPrompt = `You are a document parser. Format the following text into clean, structured Markdown. Reconstruct headers (#, ##, ###), lists, tables, and paragraphs where appropriate. Do NOT add conversational filler. Just output the raw Markdown content.\n\nText:\n${rawContent}`;
              content = await invoke<string>("orchestrate_agent", {
                prompt: systemPrompt,
                provider: llmProvider || "local",
                model: llmModel || "",
                apiKey: llmApiKey || null,
                baseUrl: llmBaseUrl || null,
                activeNoteId: null,
              });
            } else {
              // Raw text mode: apply the same conservative local
              // markdown-ification the PDF path uses so plain .txt imports
              // render with headers and lists instead of a wall of text.
              content = rawToMarkdown(rawContent);
            }

            invoke("ingest_srd_text", {
              category: "Reference",
              source: sourceName,
              content,
            })
              .then(() => loadRules())
              .then(() => {
                showToast(
                  `Successfully ingested "${file.name}" with ${mode === "ai" ? "AI parsing" : "raw text"}!`,
                );
              })
              .catch((err) => {
                console.error("Failed to ingest SRD:", err);
                showToast("Error during SRD ingestion: " + err);
              });
          } catch (err: any) {
            console.error("Ingestion failed:", err);
            showToast("Failed to ingest: " + err.message);
          }
        };
        reader.readAsText(file);
      }
    },
    [showToast, loadRules, llmProvider, llmModel, llmApiKey, llmBaseUrl, onProgress],
  );

  const handleIngestSRD = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIngestDialog({
        open: true,
        fileName: file.name,
        onSelect: (mode) => {
          executeSRDIngestion(file, mode);
        },
      });

      e.target.value = "";
    },
    [executeSRDIngestion],
  );

  return {
    ingestDialog,
    setIngestDialog,
    handleIngestSRD,
  };
};
