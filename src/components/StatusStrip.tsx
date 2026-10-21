import React from "react";
import type { ProviderStatus } from "../hooks/useProviderStatus";

export interface StatusStripProps {
  provider: string;
  model: string;
  status: ProviderStatus;
  /**
   * Whether semantic search is available. `false` means `search_vault` is
   * returning FTS5 keyword results only, so the strip says so rather than
   * letting the user believe a semantic search ran.
   */
  embeddingReady?: boolean;
  /** Opens the Settings view (the strip is clickable). */
  onOpenSettings: () => void;
}

/**
 * A 24px bottom status strip showing the active LLM provider/model and its
 * reachability. Clicking it opens Settings. Reachable-but-no-models and
 * unreachable states are shown distinctly.
 */
export const StatusStrip: React.FC<StatusStripProps> = ({
  provider,
  model,
  status,
  embeddingReady = true,
  onOpenSettings,
}) => {
  const { reachable, modelAvailable, checking } = status;
  const dotColor = checking
    ? "var(--muted)"
    : reachable
      ? "var(--success)"
      : "var(--danger)";

  return (
    <div
      onClick={onOpenSettings}
      data-od-id="status-strip"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenSettings();
      }}
      title="Open Settings"
      style={{
        height: "24px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        fontSize: "11px",
        color: "var(--muted)",
        cursor: "pointer",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span>
        {provider}
        {model ? ` · ${model}` : ""}
      </span>
      {!reachable && !checking && (
        <span
          style={{
            fontWeight: 700,
            color: "var(--danger)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "10px",
          }}
        >
          offline
        </span>
      )}
      {reachable && !modelAvailable && !checking && (
        <span style={{ fontStyle: "italic" }}>no models</span>
      )}
      {!embeddingReady && (
        <span
          data-od-id="status-embedding-degraded"
          title="The embedding model is not loaded — search returns keyword matches only."
          style={{ fontStyle: "italic" }}
        >
          Search: keyword only
        </span>
      )}
    </div>
  );
};
