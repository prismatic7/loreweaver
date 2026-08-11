import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  FileText,
  Save,
  Users,
  Zap,
} from "lucide-react";

interface TemplateProperty {
  type: string;
  default: unknown;
}

interface TemplateAction {
  label: string;
  hook: string;
  plugin: string;
}

interface TemplateEntry {
  name: string;
  properties: Record<string, TemplateProperty>;
  actions: Array<TemplateAction>;
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
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const loadTemplates = async () => {
    setIsRefreshing(true);
    try {
      const entries = await invoke<TemplateEntry[]>("list_templates");
      setTemplates(entries || []);
      if (entries && entries.length > 0) {
        setSelectedTemplate((prev) =>
          prev && entries.some((t) => t.name === prev) ? prev : entries[0].name,
        );
      } else {
        setSelectedTemplate("");
      }
    } catch (err) {
      console.error("Failed to load templates:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath]);

  const currentTemplate = templates.find((t) => t.name === selectedTemplate);

  // Reset form values whenever the template changes so fields don't leak
  // between character types.
  useEffect(() => {
    if (!currentTemplate) {
      setFormValues({});
      return;
    }
    const defaults: Record<string, string> = {};
    Object.entries(currentTemplate.properties).forEach(([key, prop]) => {
      defaults[key] = String(prop.default ?? "");
    });
    setFormValues(defaults);
  }, [selectedTemplate, currentTemplate?.name]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSaveAsNote = async () => {
    if (!currentTemplate) return;
    setIsSaving(true);
    try {
      const timestamp = Date.now();
      const title = formValues["name"]?.trim() || `${currentTemplate.name} ${timestamp.toString().slice(-4)}`;
      const frontmatter: Record<string, unknown> = {
        type: "Character",
        template: currentTemplate.name,
        tags: ["character"],
      };
      Object.entries(formValues).forEach(([key, value]) => {
        if (value.trim() !== "") frontmatter[key] = value.trim();
      });

      const content = [
        `# ${title}`,
        "",
        `Template: **${currentTemplate.name}**`,
        "",
        ...Object.entries(formValues)
          .filter(([, v]) => v.trim() !== "")
          .map(([key, value]) => `- **${key}**: ${value}`),
        "",
      ].join("\n");

      const newNote = {
        id: `note-${timestamp}`,
        title,
        path: `Characters/${title.replace(/[\\/:*?"<>|]/g, "_")}.md`,
        frontmatter,
        content,
      };
      await invoke("save_note", { note: newNote });
      alert(`Character sheet saved as "${title}".`);
      onOpenNote(newNote.id);
    } catch (err) {
      alert("Failed to save character sheet: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunAction = async (action: TemplateAction) => {
    setRunningAction(action.label);
    try {
      const payload = JSON.stringify({
        template: currentTemplate?.name,
        values: formValues,
      });
      const result = await invoke<string>("execute_plugin_hook", {
        pluginId: action.plugin,
        hook: action.hook,
        payload,
      });
      if (result && result.trim()) {
        alert(result);
      }
    } catch (err) {
      alert(`Action "${action.label}" failed: ${err}`);
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div
      className="view-container"
      data-od-id="character-sheets-view"
      style={{ padding: "40px 32px", overflowY: "auto" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              letterSpacing: "-0.01em",
              fontWeight: 600,
              margin: 0,
            }}
          >
            Character Sheets
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              margin: "4px 0 20px 0",
            }}
          >
            Build character sheets from modular templates, or import a PDF as a
            note.
          </p>
        </div>
        <button
          className="btn btn-sm"
          type="button"
          onClick={loadTemplates}
          disabled={isRefreshing}
          title="Reload templates"
          data-od-id="character-refresh-btn"
        >
          <RefreshCw size={12} className={isRefreshing ? "spin" : ""} />
          {isRefreshing ? "Reloading..." : "Reload"}
        </button>
      </div>

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
          data-od-id="character-template-select"
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
          style={{ padding: "8px 12px" }}
          onClick={() => document.getElementById("character-pdf-input")?.click()}
          disabled={isImporting}
          data-od-id="character-import-pdf-btn"
        >
          {isImporting ? (
            <>
              <RefreshCw size={12} className="spin" /> Importing...
            </>
          ) : (
            <>
              <FileText size={12} /> Import from PDF
            </>
          )}
        </button>
        <input
          type="file"
          id="character-pdf-input"
          style={{ display: "none" }}
          accept=".pdf"
          onChange={handleImportPdf}
        />
      </div>

      {templates.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "32px 24px",
            maxWidth: "720px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            textAlign: "center",
          }}
        >
          <Users size={24} style={{ color: "var(--muted)" }} />
          <h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0 }}>
            No templates found
          </h3>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              margin: 0,
              maxWidth: "420px",
            }}
          >
            Create a <code>.templates/</code> folder in your vault with
            markdown template files (e.g. <code>.templates/Character.md</code>)
            containing <code>properties</code> and optional <code>actions</code>{" "}
            frontmatter, then reload.
          </p>
        </div>
      ) : currentTemplate ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "20px",
            maxWidth: "720px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0 }}>
              {currentTemplate.name}
            </h3>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={handleSaveAsNote}
              disabled={isSaving}
              data-od-id="character-save-btn"
            >
              <Save size={12} />
              {isSaving ? "Saving..." : "Save as Note"}
            </button>
          </div>

          {Object.entries(currentTemplate.properties).map(([key]) => (
            <div key={key} style={{ marginBottom: "12px" }}>
              <label
                htmlFor={`character-field-${key}`}
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
                id={`character-field-${key}`}
                type="text"
                value={formValues[key] ?? ""}
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
                data-od-id={`character-field-${key}`}
              />
            </div>
          ))}

          {currentTemplate.actions.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                marginTop: "16px",
                paddingTop: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  letterSpacing: "0.05em",
                  marginBottom: "8px",
                }}
              >
                Template Actions
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {currentTemplate.actions.map((action) => (
                  <button
                    key={`${action.plugin}/${action.hook}`}
                    className="btn btn-sm"
                    type="button"
                    onClick={() => handleRunAction(action)}
                    disabled={runningAction !== null}
                    data-od-id={`character-action-${action.label}`}
                  >
                    <Zap size={12} />
                    {runningAction === action.label ? "Running..." : action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
