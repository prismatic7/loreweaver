import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TemplateProperty {
  type: string;
  default: unknown;
}

interface TemplateEntry {
  name: string;
  properties: Record<string, TemplateProperty>;
  actions: Array<{ label: string; hook: string; plugin: string }>;
}

interface CharacterSheetViewProps {
  vaultPath: string;
  alert: (message: string) => void;
  onOpenNote: (noteId: string) => void;
}

export const CharacterSheetView: React.FC<CharacterSheetViewProps> = ({
  vaultPath,
  alert,
  onOpenNote,
}) => {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((entries) => {
        setTemplates(entries || []);
        if (entries && entries.length > 0) {
          setSelectedTemplate(entries[0].name);
        }
      })
      .catch((err) => console.error("Failed to load templates:", err));
  }, [vaultPath]);

  const currentTemplate = templates.find((t) => t.name === selectedTemplate);

  const handleImportPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setIsImporting(false);
        return;
      }
      // Extract base64 payload from the data URL (matches save_note_asset pattern).
      const base64Data = dataUrl.split(",")[1] || "";
      try {
        const markdown = await invoke<string>("convert_pdf_to_markdown", {
          base64Pdf: base64Data,
        });
        // Create a note from the markdown and open it for review.
        const newNote = {
          id: `note-${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ""),
          path: `Characters/${file.name.replace(/\.pdf$/i, "")}.md`,
          frontmatter: { type: "Character", tags: ["imported"] },
          content: markdown,
        };
        await invoke("save_note", { note: newNote });
        onOpenNote(newNote.id);
        alert("PDF imported as a note. Review and edit before saving.");
      } catch (err) {
        alert("PDF import failed: " + err);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      className="view-container"
      data-od-id="character-sheets-view"
      style={{ padding: "40px 32px", overflowY: "auto" }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          letterSpacing: "-0.01em",
          fontWeight: 600,
        }}
      >
        Character Sheets
      </h2>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 20px 0" }}>
        Build character sheets from modular templates, or import a PDF as a note.
      </p>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          alignItems: "center",
        }}
      >
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          style={{
            padding: "8px 10px",
            fontSize: "12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        >
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          type="button"
          style={{
            padding: "8px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            cursor: "pointer",
            fontSize: "12px",
          }}
          onClick={() => document.getElementById("character-pdf-input")?.click()}
          disabled={isImporting}
          data-od-id="character-import-pdf-btn"
        >
          {isImporting ? "🔄 Importing..." : "📄 Import from PDF"}
        </button>
        <input
          type="file"
          id="character-pdf-input"
          style={{ display: "none" }}
          accept=".pdf"
          onChange={handleImportPdf}
        />
      </div>

      {currentTemplate && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "20px",
            maxWidth: "720px",
          }}
        >
          <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 16px 0" }}>
            {currentTemplate.name}
          </h3>
          {Object.entries(currentTemplate.properties).map(([key, prop]) => (
            <div key={key} style={{ marginBottom: "12px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  color: "var(--muted)",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                {key}
              </label>
              <input
                type="text"
                value={formValues[key] ?? String(prop.default ?? "")}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, [key]: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: "12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 0,
                  color: "var(--fg)",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
