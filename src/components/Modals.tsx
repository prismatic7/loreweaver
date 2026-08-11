import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Trash2 } from "lucide-react";

export interface ContextMenuItem {
  x: number;
  y: number;
  type: "note" | "folder" | "rule" | "rule-folder";
  targetId: string;
  path?: string;
  isRulebook?: boolean;
}

export interface ConfirmModalProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  message,
  onConfirm,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap({ active: open, containerRef });

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "360px",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {message}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "6px 12px",
              borderRadius: 0,
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: "var(--danger)",
              border: "none",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 0,
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export interface PromptModalProps {
  open: boolean;
  message: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  open,
  message,
  defaultValue = "",
  onSubmit,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useFocusTrap({ active: open, containerRef, initialFocusRef: inputRef });

  if (!open) return null;

  const submit = () => {
    onSubmit(inputRef.current?.value || "");
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "360px",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} style={{ fontSize: "14px", fontWeight: 600 }}>
          {message}
        </div>
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultValue}
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: "13px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "6px 12px",
              borderRadius: 0,
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            style={{
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 0,
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export interface AlertModalProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  open,
  message,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap({ active: open, containerRef });

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "360px",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 0,
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export interface IngestModalProps {
  open: boolean;
  fileName: string;
  onSelect: (mode: "text" | "ai") => void;
  onCancel: () => void;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  open,
  fileName,
  onSelect,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap({ active: open, containerRef });

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "400px",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div
            id={titleId}
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            Select Import Mode
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              lineHeight: 1.4,
            }}
          >
            Choose how you want to ingest the rulebook file:
            <div
              style={{
                fontWeight: 600,
                marginTop: "6px",
                color: "var(--fg)",
              }}
            >
              {fileName}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={() => onSelect("text")}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "12px",
              borderRadius: 0,
              cursor: "pointer",
              textAlign: "left",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              Raw Layout-Preserving (Local)
            </span>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              Quickly extracts text line-by-line using local layouts.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelect("ai")}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "12px",
              borderRadius: 0,
              cursor: "pointer",
              textAlign: "left",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--accent)" }}>
              ✨ AI Markdown Parser (ML)
            </span>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              Uses your configured LLM provider page-by-page to format headers,
              lists, and tables.
            </span>
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export interface NewRuleModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (category: string, subcategory: string) => void;
}

export const NewRuleModal: React.FC<NewRuleModalProps> = ({
  open,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Combat");
  const [subcategory, setSubcategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    if (open) {
      setTitle("");
      setCategory("Combat");
      setSubcategory("General");
      setCustomCategory("");
    }
  }, [open]);

  useFocusTrap({ active: open, containerRef, initialFocusRef: titleInputRef });

  if (!open) return null;

  const finalCategory =
    category === "CUSTOM"
      ? customCategory.trim() || "Custom Rules"
      : category;
  const folder = subcategory
    ? `${finalCategory}/${subcategory}`
    : finalCategory;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: 24,
          borderRadius: 0,
          width: 400,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ margin: 0, fontSize: 16 }}>
          Add Custom Rulebook Entry
        </h3>
        <input
          ref={titleInputRef}
          placeholder="Rule Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        >
          <option value="General Rules">General Rules</option>
          <option value="Combat Rules">Combat Rules</option>
          <option value="Magic & Spells">Magic & Spells</option>
          <option value="CUSTOM">+ Custom Category...</option>
        </select>
        {category === "CUSTOM" && (
          <input
            placeholder="Custom Category Name"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
          />
        )}
        <input
          placeholder="Subcategory (e.g. Actions, Conditions, Spells)"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        />
        <textarea
          placeholder="Rule Details & Mechanics..."
          value=""
          readOnly
          style={{
            height: 100,
            padding: "6px 10px",
            fontSize: 13,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onSave(folder, title)}
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
};

export interface NewVaultModalProps {
  open: boolean;
  onClose: () => void;
  currentCanvasFolder: string | null;
}

export const NewVaultModal: React.FC<NewVaultModalProps> = ({
  open,
  onClose,
  currentCanvasFolder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  useFocusTrap({
    active: open,
    containerRef,
    initialFocusRef: closeButtonRef,
  });

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: 24,
          borderRadius: 0,
          width: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ margin: 0, fontSize: 16 }}>
          Campaign Vault Settings
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Active Canvas Folder: {currentCanvasFolder || "Root"}
        </p>
        <button ref={closeButtonRef} className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export interface ContextMenuProps {
  menu: ContextMenuItem | null;
  onNoteTrash: (path: string) => void;
  onFolderTrash: (folderName: string, isRulebook: boolean) => void;
  onRuleDelete: (ruleId: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  onNoteTrash,
  onFolderTrash,
  onRuleDelete,
  onClose,
}) => {
  if (!menu) return null;

  const handleAction = () => {
    if (menu.type === "note" && menu.path) {
      onNoteTrash(menu.path);
    } else if (menu.type === "folder") {
      onFolderTrash(menu.targetId, false);
    } else if (menu.type === "rule") {
      onRuleDelete(menu.targetId);
    } else if (menu.type === "rule-folder") {
      onFolderTrash(menu.targetId, true);
    }
    onClose();
  };

  let label = "Delete";
  if (menu.type === "note") label = "Send to Trash";
  if (menu.type === "folder") label = "Delete Folder";
  if (menu.type === "rule") label = "Delete Rule";
  if (menu.type === "rule-folder") label = "Delete Folder";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: "transparent",
      }}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: menu.y,
          left: menu.x,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          padding: "4px 0",
          minWidth: "140px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <button
          onClick={handleAction}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--danger)",
            padding: "8px 12px",
            fontSize: "12px",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Trash2 size={12} /> {label}
        </button>
      </div>
    </div>
  );
};

export interface DropdownItemProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  label,
  icon,
  onClick,
  danger,
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    style={{
      background: "transparent",
      border: "none",
      color: danger ? "var(--danger)" : "var(--fg)",
      padding: "6px 12px",
      fontSize: "11px",
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      width: "100%",
    }}
  >
    {icon}
    {label}
  </button>
);
