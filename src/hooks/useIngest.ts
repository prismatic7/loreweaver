import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extractTextFromPdf } from "../utils/pdf";

interface UseIngestDeps {
  alert: (message: string) => void;
  loadRules: () => Promise<void>;
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl: string;
}

export interface IngestDialogState {
  open: boolean;
  fileName: string;
  onSelect: ((mode: "text" | "ai") => void) | null;
}

export const useIngest = (deps: UseIngestDeps) => {
  const { alert, loadRules, llmProvider, llmModel, llmApiKey, llmBaseUrl } = deps;
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
              alert(
                "Starting AI Markdown ingestion... Each page is being processed by your LLM. Please wait for completion.",
              );
            }

            const content = await extractTextFromPdf(
              arrayBuffer,
              mode,
              llmProvider,
              llmModel,
              llmApiKey,
              llmBaseUrl,
            );

            invoke("ingest_srd_text", {
              category: "Reference",
              source: sourceName,
              content,
            })
              .then(() => loadRules())
              .then(() => {
                alert(
                  `Successfully ingested "${file.name}" with ${mode === "ai" ? "AI parsing" : "raw text extraction"} and generated local semantic vector search chunks!`,
                );
              })
              .catch((err) => {
                console.error("Failed to ingest SRD:", err);
                alert("Error during SRD ingestion: " + err);
              });
          } catch (err: any) {
            console.error("PDF Ingestion failed:", err);
            alert("Failed to parse PDF: " + err.message);
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
              alert("Starting AI Markdown ingestion... Processing file content through your LLM.");
              const systemPrompt = `You are a document parser. Format the following text into clean, structured Markdown. Reconstruct headers (#, ##, ###), lists, tables, and paragraphs where appropriate. Do NOT add conversational filler. Just output the raw Markdown content.\n\nText:\n${rawContent}`;
              content = await invoke<string>("orchestrate_agent", {
                prompt: systemPrompt,
                provider: llmProvider || "local",
                model: llmModel || "",
                apiKey: llmApiKey || null,
                baseUrl: llmBaseUrl || null,
                activeNoteId: null,
              });
            }

            invoke("ingest_srd_text", {
              category: "Reference",
              source: sourceName,
              content,
            })
              .then(() => loadRules())
              .then(() => {
                alert(
                  `Successfully ingested "${file.name}" with ${mode === "ai" ? "AI parsing" : "raw text"}!`,
                );
              })
              .catch((err) => {
                console.error("Failed to ingest SRD:", err);
                alert("Error during SRD ingestion: " + err);
              });
          } catch (err: any) {
            console.error("Ingestion failed:", err);
            alert("Failed to ingest: " + err.message);
          }
        };
        reader.readAsText(file);
      }
    },
    [alert, loadRules, llmProvider, llmModel, llmApiKey, llmBaseUrl],
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
