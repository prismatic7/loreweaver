import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UiAction, UiField, UiPanel } from "../bindings";

/**
 * The host-side renderer for a plugin's declarative `ui` panel.
 *
 * Panels are *data*, never HTML: the plugin declares `fields` (a typed schema)
 * and `actions` (buttons naming a hook). This component renders the fields,
 * invokes the action's hook via the existing `execute_plugin_hook` command, and
 * renders one of three typed results — `text`, `table`, or `note`. A plugin
 * never receives DOM, filesystem, or network handles for its panel.
 */

type FieldValues = Record<string, string>;

/** The three result shapes an action hook may return (JSON string). */
type PanelResult =
  | { type: "text"; text: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "note"; noteId: string; title: string };

export interface PluginPanelProps {
  pluginId: string;
  panel: UiPanel;
  /** Invoked when an action returns a `note` result, to open that note. */
  onOpenNote?: (noteId: string) => void;
}

export const PluginPanel: React.FC<PluginPanelProps> = ({
  pluginId,
  panel,
  onOpenNote,
}) => {
  const [values, setValues] = useState<FieldValues>(() => initialValues(panel.fields));
  const [result, setResult] = useState<PanelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const runAction = async (action: UiAction) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<string>("execute_plugin_hook", {
        pluginId,
        hook: action.hook,
        payload: JSON.stringify(values),
      });
      setResult(parseResult(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
      }}
      data-od-id={`plugin-panel-${panel.id}`}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}
      >
        {panel.title || panel.id}
      </span>

      {panel.fields?.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(value) => setField(field.key, value)}
          idPrefix={panel.id}
        />
      ))}

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {(panel.actions ?? []).map((action) => (
          <button
            key={action.id}
            className="btn btn-sm btn-primary"
            type="button"
            disabled={loading}
            onClick={() => runAction(action)}
            style={{ padding: "6px 10px", fontSize: "11px", cursor: "pointer" }}
            data-od-id={`plugin-panel-${panel.id}-action-${action.id}`}
          >
            {action.label || action.id}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ fontSize: "11px", color: "var(--muted)" }}>Running…</div>
      )}
      {error && (
        <div
          style={{
            padding: "8px 10px",
            fontSize: "11px",
            color: "var(--danger)",
            background: "oklch(from var(--danger) l c h / 0.1)",
            border: "1px solid var(--danger)",
            borderRadius: 0,
            wordBreak: "break-word",
          }}
          data-od-id={`plugin-panel-${panel.id}-error`}
        >
          {error}
        </div>
      )}
      {result && <ResultView result={result} onOpenNote={onOpenNote} />}
    </div>
  );
};

function initialValues(fields: UiField[] | undefined): FieldValues {
  const out: FieldValues = {};
  for (const field of fields ?? []) {
    out[field.key] = field.options?.[0] ?? "";
  }
  return out;
}

/** Parses a hook's JSON-string result into one of the three typed shapes. */
function parseResult(raw: string): PanelResult {
  const parsed = JSON.parse(raw);
  if (parsed && parsed.type === "table") {
    return {
      type: "table",
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  }
  if (parsed && parsed.type === "note") {
    return {
      type: "note",
      noteId: String(parsed.noteId ?? ""),
      title: String(parsed.title ?? "Untitled note"),
    };
  }
  if (parsed && parsed.type === "text") {
    return { type: "text", text: String(parsed.text ?? "") };
  }
  // A non-conformant string result is rendered as plain text.
  return { type: "text", text: raw };
}

/** Renders one of the three typed results. */
const ResultView: React.FC<{
  result: PanelResult;
  onOpenNote?: (noteId: string) => void;
}> = ({ result, onOpenNote }) => {
  if (result.type === "text") {
    return (
      <div
        style={{
          padding: "8px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          fontSize: "12px",
          whiteSpace: "pre-wrap",
        }}
      >
        {result.text}
      </div>
    );
  }

  if (result.type === "table") {
    return (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "11px",
        }}
      >
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th
                key={column}
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                  padding: "4px 6px",
                  color: "var(--muted)",
                  fontWeight: 700,
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    padding: "4px 6px",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // result.type === "note"
  return (
    <button
      className="nav-item"
      type="button"
      onClick={() => onOpenNote?.(result.noteId)}
      style={{
        padding: "6px 8px",
        fontSize: "12px",
        textAlign: "left",
        cursor: "pointer",
      }}
      data-od-id="plugin-panel-open-note"
    >
      {result.title}
    </button>
  );
};

const Field: React.FC<{
  field: UiField;
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
}> = ({ field, value, onChange, idPrefix }) => {
  const id = `${idPrefix}-${field.key}`;
  const label = (
    <label
      htmlFor={id}
      style={{
        display: "block",
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--muted)",
        marginBottom: "4px",
      }}
    >
      {field.label || field.key}
    </label>
  );

  if (field.field_type === "select") {
    return (
      <div>
        {label}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
            fontSize: "12px",
          }}
          data-od-id={`plugin-field-${field.key}`}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            minHeight: "60px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
            fontSize: "12px",
            padding: "6px 8px",
            resize: "vertical",
          }}
          data-od-id={`plugin-field-${field.key}`}
        />
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        id={id}
        type={field.field_type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          color: "var(--fg)",
          fontSize: "12px",
          outline: "none",
        }}
        data-od-id={`plugin-field-${field.key}`}
      />
    </div>
  );
};
