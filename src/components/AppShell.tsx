import React from "react";
import {
  BookOpen,
  Brain,
  Compass,
  FolderOpen,
  Layers,
  Map as MapIcon,
  Moon,
  Network,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { CampaignNote, RuleEntry, SearchResult } from "../types";

export type AppView =
  | "dashboard"
  | "vault"
  | "rules"
  | "ai"
  | "settings"
  | "canvas"
  | "trash"
  | "character-sheets"
  | "map"
  | "graph"
  | "timeline";

export interface AppShellProps {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  vaultPath: string;
  vaults: Array<{ path: string; name: string }>;
  onSwitchVault: (path: string) => void;
  onCreateVault: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchResults: SearchResult[];
  notes: CampaignNote[];
  rules: RuleEntry[];
  onSelectSearchResult: (result: SearchResult) => void;
  searchRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  rightPanel: React.ReactNode;
  onLoadTrash: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeView,
  setActiveView,
  theme,
  setTheme,
  vaultPath,
  vaults,
  onSwitchVault,
  onCreateVault,
  searchQuery,
  setSearchQuery,
  isSearchOpen,
  setIsSearchOpen,
  searchResults,
  onSelectSearchResult,
  searchRef,
  children,
  rightPanel,
  onLoadTrash,
}) => {
  return (
    <div className="app-container">
      <nav className="ribbon" data-od-id="ribbon">
        <div
          className="ribbon-logo"
          title="Loreweaver"
          onClick={() => setActiveView("dashboard")}
        >
          <Layers size={22} style={{ color: "var(--accent)" }} />
        </div>

        <div className="ribbon-nav">
          <RibbonButton
            activeView={activeView}
            target="dashboard"
            title="Dashboard"
            icon={<Compass size={18} />}
            onClick={() => setActiveView("dashboard")}
          />
          <RibbonButton
            activeView={activeView}
            target="vault"
            title="Campaign Vault"
            icon={<FolderOpen size={18} />}
            onClick={() => setActiveView("vault")}
          />
          <RibbonButton
            activeView={activeView}
            target="rules"
            title="Rulebooks & SRDs"
            icon={<BookOpen size={18} />}
            onClick={() => setActiveView("rules")}
          />
          <RibbonButton
            activeView={activeView}
            target="ai"
            title="AI & Generations"
            icon={<Brain size={18} />}
            onClick={() => setActiveView("ai")}
          />
          <RibbonButton
            activeView={activeView}
            target="character-sheets"
            title="Character Sheets"
            icon={<Users size={18} />}
            onClick={() => setActiveView("character-sheets")}
          />
          <RibbonButton
            activeView={activeView}
            target="map"
            title="Map Builder"
            icon={<MapIcon size={18} />}
            onClick={() => setActiveView("map")}
          />
          <RibbonButton
            activeView={activeView}
            target="graph"
            title="Entity Graph"
            icon={<Network size={18} />}
            onClick={() => setActiveView("graph")}
          />
          <RibbonButton
            activeView={activeView}
            target="timeline"
            title="Timeline"
            icon={<Layers size={18} />}
            onClick={() => setActiveView("timeline")}
          />
        </div>

        <div className="ribbon-footer">
          <RibbonButton
            activeView={activeView}
            target="trash"
            title="Trash & Archive"
            icon={<Trash2 size={18} />}
            onClick={() => {
              onLoadTrash();
              setActiveView("trash");
            }}
          />
          <RibbonButton
            activeView={activeView}
            target="settings"
            title="Settings"
            icon={<SettingsIcon size={18} />}
            onClick={() => setActiveView("settings")}
          />
          <button
            className="ribbon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle Theme"
            data-od-id="btn-theme-toggle"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      <main className="main-area" data-od-id="main-area">
        <header className="toolbar" data-od-id="toolbar">
          <div
            className="breadcrumb"
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            {activeView === "dashboard" && "Dashboard"}
            {(activeView === "vault" || activeView === "canvas") && (
              <>
                Vault / <span>Notebook</span>
              </>
            )}
            {activeView === "rules" && (
              <>
                Rules / <span>Rulebook</span>
              </>
            )}
            {activeView === "ai" && "AI & Generations"}
            {activeView === "settings" && "Settings"}
            {activeView === "trash" && "Vault & Rulebook Trash"}
            {activeView === "character-sheets" && "Character Sheets"}
            {activeView === "map" && "Map Builder"}
            {activeView === "graph" && "Entity Graph"}
            {activeView === "timeline" && "Timeline"}

            <div
              style={{
                width: "1px",
                height: "14px",
                background: "var(--border)",
                margin: "0 10px",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FolderOpen size={14} style={{ color: "var(--accent)" }} />
              <select
                value={vaultPath}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "NEW_VAULT_TRIGGER") {
                    onCreateVault();
                  } else if (val) {
                    onSwitchVault(val);
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  paddingRight: "8px",
                }}
              >
                {vaults.map((v) => (
                  <option
                    key={v.path}
                    value={v.path}
                    style={{ background: "var(--surface)", color: "var(--fg)" }}
                  >
                    {v.name}
                  </option>
                ))}
                <option
                  value="NEW_VAULT_TRIGGER"
                  style={{
                    background: "var(--surface)",
                    color: "var(--accent)",
                  }}
                >
                  + Create New Vault...
                </option>
              </select>
            </div>
          </div>

          <div className="toolbar-actions">
            <div className="search-wrapper" ref={searchRef}>
              <div className="search-bar">
                <Search />
                <input
                  placeholder="Semantic search campaign..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  aria-label="Search vault"
                />
              </div>
              {isSearchOpen && searchQuery.trim() && (
                <div className="search-results">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--border)",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--muted)",
                      }}
                    >
                      HYBRID SEMANTIC SEARCH RESULTS
                    </span>
                    <button
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery("");
                      }}
                      style={{
                        padding: "2px 4px",
                        fontSize: "0.75rem",
                        border: "none",
                      }}
                    >
                      Close
                    </button>
                  </div>
                  {searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      No vector similarity matches found
                    </div>
                  ) : (
                    searchResults.map((result, idx) => (
                      <div
                        key={idx}
                        className="search-result-item"
                        onClick={() => {
                          onSelectSearchResult(result);
                          setIsSearchOpen(false);
                          setSearchQuery("");
                        }}
                      >
                        <div className="search-result-title">{result.title}</div>
                        <div className="search-result-snippet">
                          {result.snippet}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div
          className="workspace-content"
          style={{ flex: 1, overflow: "hidden", display: "flex" }}
        >
          <div
            style={{
              flex: 1,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </div>
          {rightPanel}
        </div>
      </main>
    </div>
  );
};

const RibbonButton: React.FC<{
  activeView: AppView;
  target: AppView;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ activeView, target, title, icon, onClick }) => (
  <button
    className={`ribbon-btn ${activeView === target ? "active" : ""}`}
    onClick={onClick}
    title={title}
    data-od-id={`nav-${target}`}
  >
    {icon}
  </button>
);
