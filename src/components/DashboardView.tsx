import React from "react";
import { ChevronRight } from "lucide-react";
import { CampaignNote, RuleEntry } from "../types";

export interface DashboardViewProps {
  notes: CampaignNote[];
  rules: RuleEntry[];
  setActiveView: (
    view: "dashboard" | "vault" | "rules" | "ai" | "settings" | "canvas" | "trash"
  ) => void;
  setSelectedNoteId: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  notes,
  rules,
  setActiveView,
  setSelectedNoteId,
}) => {
  return (
    <div className="view-container" data-od-id="dashboard-view">
      <div className="dashboard-grid">
        <div className="dash-hero" data-od-id="dash-hero">
          <div className="dash-hero-content">
            <div className="dash-hero-title">Campaign Workspace</div>
            <div className="dash-hero-desc">
              Welcome back, GM. Your campaign database currently has{" "}
              <strong>{notes.length} notes</strong> and{" "}
              <strong>{rules.length} rule guides</strong> indexed.
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setActiveView("vault")}
                data-od-id="dash-open-vault"
              >
                Open Vault
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setActiveView("ai")}
                data-od-id="dash-open-architect"
              >
                Ask Architect
              </button>
            </div>
          </div>
          <div className="dash-hero-image">
            <img src="/elven_mage.jpg" alt="Elven mage" />
          </div>
        </div>

        <div
          className="dash-card"
          onClick={() => setActiveView("vault")}
          data-od-id="dash-notes"
        >
          <div className="dash-card-count">{notes.length}</div>
          <div className="dash-card-label">Campaign Notes</div>
          <div className="dash-card-desc">
            Worldbuilding, NPCs, locations, and lore
          </div>
        </div>

        <div
          className="dash-card"
          onClick={() => setActiveView("rules")}
          data-od-id="dash-rules"
        >
          <div className="dash-card-count">{rules.length}</div>
          <div className="dash-card-label">Rule Entries</div>
          <div className="dash-card-desc">
            Core rules, magic, and reference material
          </div>
        </div>

        <div
          className="dash-card"
          onClick={() => setActiveView("ai")}
          data-od-id="dash-ai"
        >
          <div className="dash-card-count">AI</div>
          <div className="dash-card-label">Campaign Architect</div>
          <div className="dash-card-desc">
            Chat, generate, and orchestrate
          </div>
        </div>

        <div className="dash-recent" data-od-id="dash-recent">
          <div className="dash-recent-header">
            <span className="panel-title" style={{ marginBottom: 0 }}>
              Recent Notes
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setActiveView("vault")}
            >
              View All
            </button>
          </div>
          {notes.map((note) => (
            <div
              key={note.id}
              className="dash-recent-item"
              onClick={() => {
                setActiveView("vault");
                setSelectedNoteId(note.id);
              }}
            >
              <div>
                <div className="dash-recent-title">{note.title}</div>
                <div className="dash-recent-cat">
                  {String(note.frontmatter?.type || "Note")}
                </div>
              </div>
              <ChevronRight size={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
