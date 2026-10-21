import React from "react";

/**
 * Run Mode — the live-play hub.
 *
 * Grid layout:
 *   - Scene (centre)         — the note currently "on stage", plus a picker.
 *   - Initiative (left rail) — read-only combat tracker.
 *   - Pinned Rules (right)   — compact rule cards, plus a pin picker.
 *   - Ledger (bottom)        — the append-only session ledger.
 *   - Dice (drawer)          — quick dice roll.
 */
export interface RunModeViewProps {
  /** The note currently on stage. */
  sceneNote?: { id: string; title: string; content: string } | null;
  /** Rules pinned for quick reference. */
  pinnedRules?: Array<{ id: string; title: string; content: string }>;
  /** Notes available to put on stage. */
  availableNotes?: Array<{ id: string; title: string }>;
  /** Rules available to pin. */
  availableRules?: Array<{ id: string; title: string }>;
  /** Rule ids currently pinned (for the toggle). */
  pinnedRuleIds?: string[];
  onSelectScene?: (noteId: string) => void;
  onTogglePinRule?: (ruleId: string) => void;
  /** Read-only initiative tracker state, a JSON string. */
  initiativeState?: string | null;
  /** Session ledger events, oldest first. */
  ledgerEvents?: Array<{ id: string; kind: string; payload: string }>;
  /** Dice history, newest first. */
  diceHistory?: string[];
  rollDice?: (notation: string) => void;
  /** Presentation ("read aloud") mode: chrome hidden, scene only, large type. */
  presentation?: boolean;
  onTogglePresentation?: () => void;
}

export const RunModeView: React.FC<RunModeViewProps> = ({
  sceneNote,
  pinnedRules = [],
  availableNotes = [],
  availableRules = [],
  pinnedRuleIds = [],
  onSelectScene,
  onTogglePinRule,
  initiativeState,
  ledgerEvents = [],
  diceHistory = [],
  rollDice,
  presentation = false,
  onTogglePresentation,
}) => {
  const pinCandidates = availableRules.filter(
    (rule) => !pinnedRuleIds.includes(rule.id),
  );

  if (presentation) {
    return (
      <div
        data-od-id="run-presentation"
        style={{
          flex: 1,
          padding: "40px 8vw",
          overflowY: "auto",
          background: "var(--bg)",
          fontSize: "1.3rem",
          lineHeight: 1.7,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            color: "var(--muted)",
          }}
        >
          <span style={{ fontSize: "0.8rem" }}>Press Esc to exit read-aloud</span>
          <button
            className="btn btn-sm"
            type="button"
            onClick={onTogglePresentation}
            style={{ fontSize: "12px", cursor: "pointer" }}
          >
            Exit
          </button>
        </div>
        {sceneNote ? (
          <div style={{ color: "var(--fg)" }}>
            <h1 style={{ fontSize: "2rem", marginBottom: "16px" }}>
              {sceneNote.title}
            </h1>
            <div style={{ whiteSpace: "pre-wrap" }}>{sceneNote.content}</div>
          </div>
        ) : (
          <EmptyHint>No scene on stage.</EmptyHint>
        )}
      </div>
    );
  }

  return (
    <div
      data-od-id="run-mode-view"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "220px 1fr 260px",
        gridTemplateRows: "1fr 160px",
        gridTemplateAreas: `
          "initiative scene rules"
          "initiative ledger rules"
        `,
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Initiative (left rail) */}
      <section
        data-od-id="run-initiative"
        style={{
          gridArea: "initiative",
          borderRight: "1px solid var(--border)",
          padding: "12px",
          overflowY: "auto",
          background: "var(--surface)",
        }}
      >
        <PanelTitle>Initiative</PanelTitle>
        {initiativeState ? (
          <InitiativePanel stateJson={initiativeState} />
        ) : (
          <EmptyHint>No initiative tracker loaded.</EmptyHint>
        )}
      </section>

      {/* Scene (centre) */}
      <section
        data-od-id="run-scene"
        style={{
          gridArea: "scene",
          padding: "16px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          <PanelTitle>Scene</PanelTitle>
          {onSelectScene && availableNotes.length > 0 && (
            <select
              value={sceneNote?.id ?? ""}
              onChange={(e) => onSelectScene(e.target.value)}
              aria-label="Next scene"
              data-od-id="run-scene-picker"
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                color: "var(--fg)",
                maxWidth: "200px",
              }}
            >
              <option value="">Pick a scene…</option>
              {availableNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
          )}
          {onTogglePresentation && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={onTogglePresentation}
              style={{ fontSize: "11px", cursor: "pointer", padding: "4px 8px" }}
              data-od-id="run-read-aloud"
            >
              Read aloud
            </button>
          )}
        </div>
        {sceneNote ? (
          <div>
            <h2 style={{ marginBottom: "8px", fontSize: "1.4rem" }}>
              {sceneNote.title}
            </h2>
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.95rem" }}>
              {sceneNote.content}
            </div>
          </div>
        ) : (
          <EmptyHint>No scene on stage. Pick a note as the current scene.</EmptyHint>
        )}
      </section>

      {/* Pinned Rules (right rail) */}
      <section
        data-od-id="run-rules"
        style={{
          gridArea: "rules",
          borderLeft: "1px solid var(--border)",
          padding: "12px",
          overflowY: "auto",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <PanelTitle>Pinned Rules</PanelTitle>
        </div>
        {onTogglePinRule && pinCandidates.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onTogglePinRule(e.target.value);
              e.target.value = "";
            }}
            aria-label="Pin a rule"
            data-od-id="run-pin-rule"
            style={{
              width: "100%",
              padding: "4px 8px",
              fontSize: "12px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
              marginBottom: "8px",
            }}
          >
            <option value="">Pin a rule…</option>
            {pinCandidates.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.title}
              </option>
            ))}
          </select>
        )}
        {pinnedRules.length === 0 ? (
          <EmptyHint>No rules pinned.</EmptyHint>
        ) : (
          pinnedRules.map((rule) => (
            <div
              key={rule.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 0,
                padding: "8px",
                marginBottom: "8px",
                fontSize: "0.85rem",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontWeight: 700 }}>{rule.title}</span>
                {onTogglePinRule && (
                  <button
                    type="button"
                    onClick={() => onTogglePinRule(rule.id)}
                    aria-label={`Unpin ${rule.title}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                {rule.content}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Ledger (bottom) */}
      <section
        data-od-id="run-ledger"
        style={{
          gridArea: "ledger",
          borderTop: "1px solid var(--border)",
          padding: "8px 12px",
          overflowY: "auto",
          background: "var(--surface)",
        }}
      >
        <PanelTitle>Session Ledger</PanelTitle>
        {ledgerEvents.length === 0 ? (
          <EmptyHint>No events yet — rolls and saves appear here.</EmptyHint>
        ) : (
          <div style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
            {ledgerEvents.map((evt) => (
              <div key={evt.id} style={{ padding: "2px 0" }}>
                {evt.kind}: {evt.payload}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dice (drawer toggle row) */}
      <div
        data-od-id="run-dice"
        style={{
          position: "absolute",
          right: "12px",
          bottom: "8px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <DiceBar diceHistory={diceHistory} rollDice={rollDice} />
      </div>
    </div>
  );
};

const PanelTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: "block",
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "var(--muted)",
      marginBottom: "8px",
    }}
  >
    {children}
  </span>
);

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
    {children}
  </div>
);

const InitiativePanel: React.FC<{ stateJson: string }> = ({ stateJson }) => {
  let state: { combatants?: Array<{ name: string; initiative: number }>; round?: number; currentIndex?: number } = {};
  try {
    state = JSON.parse(stateJson);
  } catch {
    state = {};
  }
  const combatants = state.combatants ?? [];
  return (
    <div style={{ fontSize: "0.85rem" }}>
      {state.round != null && (
        <div style={{ color: "var(--muted)", marginBottom: "6px" }}>
          Round {state.round}
        </div>
      )}
      {combatants.map((c, i) => (
        <div
          key={c.name}
          style={{
            padding: "4px 0",
            fontWeight: i === (state.currentIndex ?? -1) ? 700 : 400,
            color: i === (state.currentIndex ?? -1) ? "var(--accent)" : "var(--fg)",
          }}
        >
          {c.name} <span style={{ color: "var(--muted)" }}>{c.initiative}</span>
        </div>
      ))}
    </div>
  );
};

const DiceBar: React.FC<{
  diceHistory: string[];
  rollDice?: (notation: string) => void;
}> = ({ diceHistory, rollDice }) => {
  const [notation, setNotation] = React.useState("");
  return (
    <>
      <input
        value={notation}
        onChange={(e) => setNotation(e.target.value)}
        placeholder="1d20+4"
        aria-label="Dice notation"
        style={{
          padding: "4px 8px",
          fontSize: "12px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          color: "var(--fg)",
          width: "90px",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && notation.trim()) {
            rollDice?.(notation.trim());
            setNotation("");
          }
        }}
      />
      <button
        className="btn btn-sm"
        type="button"
        onClick={() => {
          if (notation.trim()) {
            rollDice?.(notation.trim());
            setNotation("");
          }
        }}
        style={{ padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}
      >
        Roll
      </button>
      {diceHistory.length > 0 && (
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {diceHistory[0]}
        </span>
      )}
    </>
  );
};

export default RunModeView;
