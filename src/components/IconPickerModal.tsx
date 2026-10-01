import React, { useState, useRef, useId } from "react";
import { VAULT_ICONS } from "../utils/vaultIcons";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Search, X } from "lucide-react";

export interface IconPickerModalProps {
  open: boolean;
  currentIcon?: string;
  onClose: () => void;
  onSelect: (iconName: string | null) => void;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  open,
  currentIcon,
  onClose,
  onSelect,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useFocusTrap({
    active: open,
    containerRef,
    initialFocusRef: searchInputRef,
  });

  if (!open) return null;

  const filteredIcons = Object.keys(VAULT_ICONS).filter((name) =>
    name.toLowerCase().includes(searchTerm.toLowerCase().trim()),
  );

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
        background: "rgba(0, 0, 0, 0.65)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          width: "420px",
          maxWidth: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 0,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3
            id={titleId}
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "var(--font-heading)",
            }}
          >
            Select Note Icon
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div
          style={{
            padding: "12px 16px 8px 16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              padding: "6px 10px",
            }}
          >
            <Search size={14} style={{ color: "var(--muted)" }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search icons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "12px",
                color: "var(--fg)",
              }}
            />
          </div>
        </div>

        {/* Icon Grid */}
        <div
          style={{
            padding: "8px 16px 16px 16px",
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "8px",
            maxHeight: "300px",
          }}
        >
          {filteredIcons.map((iconName) => {
            const IconComp = VAULT_ICONS[iconName];
            const isSelected = currentIcon === iconName;
            return (
              <button
                key={iconName}
                type="button"
                onClick={() => {
                  onSelect(iconName);
                  onClose();
                }}
                title={iconName}
                aria-label={iconName}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 4px",
                  background: isSelected ? "var(--accent-subtle, rgba(200, 150, 60, 0.15))" : "var(--bg)",
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  cursor: "pointer",
                  color: isSelected ? "var(--accent)" : "var(--fg)",
                  borderRadius: 0,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <IconComp size={20} />
                <span
                  style={{
                    fontSize: "10px",
                    maxWidth: "60px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--muted)",
                  }}
                >
                  {iconName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              fontSize: "11px",
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            Clear Icon
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--fg)",
              fontSize: "12px",
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
