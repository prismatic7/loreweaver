import React, { useState } from "react";
import { ChevronRight, ChevronDown, Wrench, Loader2 } from "lucide-react";
import type { ChatMessage, ToolCallRecord } from "../hooks/useAgent";

/**
 * Renders a single chat message with the agent-chat affordances:
 * collapsible reasoning block, tool-call blocks with results, streamed text,
 * and a streaming indicator.
 *
 * Used by both the full-page AiView and the RightDrawer AiTab so the two
 * surfaces stay visually consistent.
 */
export const AgentMessageBlock: React.FC<{
  msg: ChatMessage;
  renderMarkdown?: (markdown: string) => React.ReactNode;
  compact?: boolean;
}> = ({ msg, renderMarkdown, compact }) => {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);

  const hasReasoning = Boolean(msg.reasoning && msg.reasoning.trim());
  const hasToolCalls = Boolean(msg.toolCalls && msg.toolCalls.length > 0);

  return (
    <div
      className={`chat-bubble ${msg.role}`}
      style={compact ? { fontSize: "12px", padding: "8px 12px" } : undefined}
    >
      {hasReasoning && (
        <div
          style={{
            marginBottom: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            borderRadius: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setReasoningOpen((open) => !open)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "4px 8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--muted)",
              textAlign: "left",
            }}
            data-od-id="agent-reasoning-toggle"
          >
            {reasoningOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Thinking
            </span>
            {msg.isStreaming && <Loader2 size={11} className="spin" />}
          </button>
          {reasoningOpen && (
            <div
              style={{
                padding: "6px 8px",
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--muted)",
                whiteSpace: "pre-wrap",
                borderTop: "1px solid var(--border)",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {msg.reasoning}
            </div>
          )}
        </div>
      )}

      {hasToolCalls && (
        <div
          style={{
            marginBottom: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            borderRadius: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setToolOpen((open) => !open)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "4px 8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--muted)",
              textAlign: "left",
            }}
            data-od-id="agent-tools-toggle"
          >
            {toolOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <Wrench size={11} />
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Tools ({msg.toolCalls!.length})
            </span>
          </button>
          {toolOpen && (
            <div
              style={{
                padding: "6px 8px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {msg.toolCalls!.map((tc: ToolCallRecord) => (
                <div key={tc.id} style={{ fontSize: 11, lineHeight: 1.4 }}>
                  <div style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {tc.name}
                  </div>
                  {tc.arguments && (
                    <div
                      style={{
                        color: "var(--muted)",
                        whiteSpace: "pre-wrap",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        marginTop: 2,
                      }}
                    >
                      {tc.arguments}
                    </div>
                  )}
                  {tc.result !== undefined && (
                    <div
                      style={{
                        color: "var(--muted)",
                        whiteSpace: "pre-wrap",
                        marginTop: 2,
                        maxHeight: 120,
                        overflowY: "auto",
                        borderLeft: "2px solid var(--border)",
                        paddingLeft: 6,
                      }}
                    >
                      {tc.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg.role === "assistant" ? (
        <div className="chat-markdown">
          {msg.text ? (
            renderMarkdown ? (
              renderMarkdown(msg.text)
            ) : (
              <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
            )
          ) : msg.isStreaming ? (
            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
              Thinking…
            </span>
          ) : null}
        </div>
      ) : (
        <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
      )}

      {msg.imageUrl && (
        <img
          src={msg.imageUrl}
          alt="Generated"
          style={{ maxWidth: "100%", marginTop: "8px", borderRadius: 0 }}
        />
      )}
    </div>
  );
};

export default AgentMessageBlock;
