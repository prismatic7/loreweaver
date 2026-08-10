import React from "react";
import { Send } from "lucide-react";

export interface AiViewProps {
  currentChatMessages: Array<{ role: "user" | "assistant"; text: string; imageUrl?: string }>;
  chatInput: string;
  setChatInput: (value: string) => void;
  handleSendChatMessage: () => void;
}

export const AiView: React.FC<AiViewProps> = ({
  currentChatMessages,
  chatInput,
  setChatInput,
  handleSendChatMessage,
}) => {
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
            }}
          >
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
              flex: 1,
              overflowY: "auto",
              padding: "20px 24px",
            }}
          >
            {currentChatMessages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.text}
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Generated"
                    style={{
                      maxWidth: "100%",
                      marginTop: "8px",
                      borderRadius: "4px",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "8px 12px",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                outline: "none",
                borderRadius: 4,
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
            <button
              className="btn btn-primary"
              onClick={handleSendChatMessage}
              data-od-id="btn-ai-send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiView;
