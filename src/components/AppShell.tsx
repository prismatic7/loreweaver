import React from "react";
import {
  BookOpen,
  Brain,
  Compass,
  FolderOpen,
  Layers,
  Link2,
  Map as MapIcon,
  Moon,
  Network,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { CampaignNote, RuleEntry, SearchResult, WorldInfo } from "../types";
import { WorldShelf } from "./WorldShelf";

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
  // World Shelf
  worlds: WorldInfo[];
  onSwitchWorld: (path: string) => void;
  onOpenLiminal: () => void;
  onCreateWorld: (name: string, scaffoldFrom: string | null) => Promise<void>;
  onExportWorld: (world: WorldInfo) => Promise<void>;
  onImportWorld: () => Promise<void>;
  onMakeWorldFromLiminal: (name: string) => Promise<void>;
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
  onClipUrl: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeView,
  setActiveView,
  theme,
  setTheme,
  vaultPath,
  worlds,
  onSwitchWorld,
  onOpenLiminal,
  onCreateWorld,
  onExportWorld,
  onImportWorld,
  onMakeWorldFromLiminal,
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
  onClipUrl,
}) => {
  return (
    <div className="app-container">
      <nav className="ribbon" data-od-id="ribbon">
        <div
          className="ribbon-logo"
          title="Loreweaver"
          onClick={() => setActiveView("dashboard")}
        >
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            {/* Outer Editorial Border */}
            <rect x="3" y="3" width="26" height="26" stroke="var(--fg)" strokeWidth="1.5" fill="none" />
            
            {/* Light Sepia Grid Line */}
            <line x1="16" y1="3" x2="16" y2="29" stroke="var(--border)" strokeWidth="1" />
            <line x1="3" y1="16" x2="29" y2="16" stroke="var(--border)" strokeWidth="1" />

            {/* Woven Occult Diamond in accent */}
            <path d="M16 8l8 8-8 8-8-8z" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinejoin="miter" />

            {/* Axis Threads (Obsidian Ink / fg) */}
            <line x1="16" y1="3" x2="16" y2="10" stroke="var(--fg)" strokeWidth="2" />
            <line x1="16" y1="22" x2="16" y2="29" stroke="var(--fg)" strokeWidth="2" />
            <line x1="3" y1="16" x2="10" y2="16" stroke="var(--fg)" strokeWidth="2" />
            <line x1="22" y1="16" x2="29" y2="16" stroke="var(--fg)" strokeWidth="2" />

            {/* Central Compass / Gate Core */}
            <circle cx="16" cy="16" r="4.5" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.5" />
            <rect x="14.5" y="14.5" width="3" height="3" fill="var(--fg)" transform="rotate(45 16 16)" />
          </svg>
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
              <WorldShelf
                worlds={worlds}
                activeWorldPath={vaultPath}
                onSwitchWorld={onSwitchWorld}
                onOpenLiminal={onOpenLiminal}
                onCreateWorld={onCreateWorld}
                onExportWorld={onExportWorld}
                onImportWorld={onImportWorld}
                onMakeWorldFromLiminal={onMakeWorldFromLiminal}
              />
            </div>
          </div>

          <div className="toolbar-actions">
            <button
              className="btn btn-sm"
              onClick={onClipUrl}
              title="Clip a web page into a note"
              data-od-id="toolbar-clip-url"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 10px",
                fontSize: "11px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Link2 size={13} /> Clip URL
            </button>
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
