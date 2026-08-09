import React from "react";

export type SettingsTab = "build" | "contributors" | "licenses" | "profile";

export interface SettingsRightPanelProps {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
}

const SettingsTabButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: active ? "var(--border)" : "transparent",
      border: "none",
      color: active ? "var(--accent)" : "var(--muted)",
      padding: "6px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
);

export const SettingsRightPanel: React.FC<SettingsRightPanelProps> = ({
  tab,
  setTab,
}) => (
  <div
    style={{
      width: "320px",
      borderLeft: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      height: "100%",
      overflowY: "hidden",
    }}
  >
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "4px 8px",
        gap: "2px",
        flexShrink: 0,
      }}
    >
      <SettingsTabButton active={tab === "build"} label="Build" onClick={() => setTab("build")} />
      <SettingsTabButton
        active={tab === "contributors"}
        label="Credits"
        onClick={() => setTab("contributors")}
      />
      <SettingsTabButton
        active={tab === "licenses"}
        label="Licenses"
        onClick={() => setTab("licenses")}
      />
      <SettingsTabButton
        active={tab === "profile"}
        label="Profile"
        onClick={() => setTab("profile")}
      />
    </div>

    <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
      {tab === "build" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
            }}
          >
            Build &amp; Update Info
          </span>
          <div
            style={{
              fontSize: "12px",
              color: "var(--fg)",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "8px",
            }}
          >
            <div>
              <strong>Version:</strong> v0.1.0-alpha
            </div>
            <div style={{ marginTop: "4px" }}>
              <strong>Channel:</strong> dev-channel
            </div>
            <div style={{ marginTop: "4px" }}>
              <strong>Built:</strong> July 22, 2026
            </div>
            <div style={{ marginTop: "4px" }}>
              <strong>Platform:</strong> macOS (aarch64)
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            Loreweaver is up to date.
          </span>
        </div>
      )}

      {tab === "contributors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
            }}
          >
            Contributors
          </span>
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div>
              👥{" "}
              <strong>Google DeepMind Advanced Agentic Coding Team</strong> - Core
              architectural designs and pairing helper APIs.
            </div>
            <div>
              👥 <strong>Chris</strong> - Principal Developer and Game Master.
            </div>
          </div>
        </div>
      )}

      {tab === "licenses" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
            }}
          >
            Licenses
          </span>
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div>
              <strong>Loreweaver Core:</strong> MIT License
            </div>
            <div>
              <strong>Tauri Framework:</strong> Apache-2.0 or MIT
            </div>
            <div>
              <strong>Vite &amp; React:</strong> MIT License
            </div>
            <div>
              <strong>SQLite-vec:</strong> MIT License
            </div>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
            }}
          >
            Developer / Company Profile
          </span>
          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            Company/developer details will be filled out here in a future release.
          </div>
        </div>
      )}
    </div>
  </div>
);
