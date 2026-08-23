import React, { useState } from "react";
import { Send, Square, Paperclip, X, ShieldAlert, Check, Ban } from "lucide-react";
import { AgentMessageBlock } from "./AgentMessageBlock";
import type { ChatMessage } from "../hooks/useAgent";
import type { ContextItem, PendingToolApproval } from "../bindings";

export interface AiViewProps {
  currentChatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  handleSendChatMessage: () => void;
  handleStopAgentStream: () => void;
  handleApproveAgentTool: () => void;
  handleRejectAgentTool: () => void;
  pendingApproval: PendingToolApproval | null;
  isAgentStreaming: boolean;
  contextItems: ContextItem[];
  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  notes: Array<{ id: string; title: string; content: string }>;
  rules: Array<{ id: string; title: string; content: string }>;
  renderMarkdown?: (markdown: string) => React.ReactNode;
  sessionTemperature: number | null;
  setSessionTemperature: (value: number | null) => void;
  defaultTemperature: number;
}

export const AiView: React.FC<AiViewProps> = ({
  currentChatMessages,
  chatInput,
  setChatInput,
  handleSendChatMessage,
  handleStopAgentStream,
  handleApproveAgentTool,
  handleRejectAgentTool,
  pendingApproval,
  isAgentStreaming,
  contextItems,
  addContextItem,
  removeContextItem,
  notes,
  rules,
  renderMarkdown,
  sessionTemperature,
  setSessionTemperature,
  defaultTemperature,
}) => {
  const [contextPickerOpen, setContextPickerOpen] = useState(false);

  const attachNote = (note: { id: string; title: string; content: string }) => {
    addContextItem({
      kind: "note",
      id: note.id,
      title: note.title,
      content: note.content,
    });
  };

  const attachRule = (rule: { id: string; title: string; content: string }) => {
    addContextItem({
      kind: "rule",
      id: rule.id,
      title: rule.title,
      content: rule.content,
    });
  };

  return (
    <div
      className="view-container"
      data-od-id="ai-view"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div>
              <span className="panel-title">Campaign Architect</span>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  marginTop: 4,
                }}
              >
                Ask the Architect for plot suggestions, NPC development, or
                worldbuilding ideas.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: 11,
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
            >
              <span>Firm</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={
                  sessionTemperature === null
                    ? defaultTemperature
                    : sessionTemperature
                }
                onChange={(e) => setSessionTemperature(Number(e.target.value))}
                style={{ width: 120, accentColor: "var(--accent)" }}
                aria-label="Session predictability (Firm ↔ Wild)"
              />
              <span>Wild</span>
              {sessionTemperature === null && (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => setSessionTemperature(defaultTemperature)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  title="Pin the default for this session"
                >
                  default
                </button>
              )}
              {sessionTemperature !== null && (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => setSessionTemperature(null)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  title="Back to world/global default"
                >
                  reset
                </button>
              )}
            </div>
          </div>

          {/* Attached context chips */}
          {contextItems.length > 0 && (
            <div
              style={{
                padding: "8px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {contextItems.map((item) => (
                <span
                  key={item.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 8px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 0,
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>
                    {item.kind === "note" ? "📄" : item.kind === "rule" ? "📜" : "✏️"}
                  </span>
                  {item.title}
                  <button
                    type="button"
                    onClick={() => removeContextItem(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      padding: 0,
                      display: "inline-flex",
                    }}
                    aria-label={`Remove ${item.title} from context`}
                    data-od-id={`ai-context-remove-${item.id}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 24px",
            }}
          >
            {currentChatMessages.map((msg, i) => (
              <AgentMessageBlock
                key={i}
                msg={msg}
                renderMarkdown={renderMarkdown}
              />
            ))}
          </div>

          {pendingApproval && (
            <div
              style={{
                margin: "0 24px 12px",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
              data-od-id="ai-approval-banner"
            >
              <ShieldAlert size={16} style={{ flexShrink: 0, color: "var(--muted)" }} />
              <div style={{ flex: 1, minWidth: 200, fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  The agent wants to write to your vault
                </div>
                <div style={{ color: "var(--muted)", fontFamily: "monospace" }}>
                  {pendingApproval.summary}
                </div>
              </div>
              <button
                className="btn btn-sm"
                type="button"
                onClick={handleApproveAgentTool}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                data-od-id="btn-ai-approve"
              >
                <Check size={13} />
                Approve
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={handleRejectAgentTool}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                data-od-id="btn-ai-reject"
              >
                <Ban size={13} />
                Reject
              </button>
            </div>
          )}

          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div style={{ position: "relative" }}>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setContextPickerOpen((open) => !open)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                }}
                title="Add context to this turn"
                data-od-id="btn-ai-add-context"
              >
                <Paperclip size={14} />
                Add Context
              </button>
              {contextPickerOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: 0,
                    width: 320,
                    maxHeight: 320,
                    overflowY: "auto",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                    zIndex: 20,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: 6,
                    }}
                  >
                    Notes
                  </div>
                  {notes.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                      No notes in this vault.
                    </div>
                  ) : (
                    notes.slice(0, 20).map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          attachNote(note);
                          setContextPickerOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: "4px 6px",
                          fontSize: 12,
                          cursor: "pointer",
                          color: "var(--fg)",
                        }}
                        data-od-id={`ai-context-note-${note.id}`}
                      >
                        {note.title}
                      </button>
                    ))
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      margin: "8px 0 6px",
                    }}
                  >
                    Rules
                  </div>
                  {rules.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                      No rules in this vault.
                    </div>
                  ) : (
                    rules.slice(0, 20).map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => {
                          attachRule(rule);
                          setContextPickerOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: "4px 6px",
                          fontSize: 12,
                          cursor: "pointer",
                          color: "var(--fg)",
                        }}
                        data-od-id={`ai-context-rule-${rule.id}`}
                      >
                        {rule.title}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <input
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "8px 12px",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                outline: "none",
                borderRadius: 0,
                color: "var(--fg)",
              }}
              placeholder="Ask the Campaign Architect..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChatMessage();
              }}
              aria-label="Ask the Campaign Architect"
            />
            {isAgentStreaming ? (
              <button
                className="btn"
                onClick={handleStopAgentStream}
                data-od-id="btn-ai-stop"
                title="Stop generating"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSendChatMessage}
                data-od-id="btn-ai-send"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiView;
