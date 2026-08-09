import React from "react";
import { PenLine, Brain, Layers, Link2 } from "lucide-react";
import { CampaignNote } from "../types";

export type RightDrawerTab =
  | "search"
  | "ai"
  | "scratchpad"
  | "backlinks"
  | "asset"
  | "voice";

export interface RightDrawerProps {
  activeView: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  tab: RightDrawerTab;
  setTab: (tab: RightDrawerTab) => void;
  scratchpadText: string;
  setScratchpadText: (value: string) => void;
  diceNotation: string;
  setDiceNotation: (value: string) => void;
  diceHistory: string[];
  rollDiceNotation: (notation: string) => void;
  pluginsList: Array<{ id: string; name: string; active?: boolean }>;
  handleRollCharacterSheet: () => void;
  handleEvaluateEncounterThreat: () => void;
  // AI tab
  currentChatMessages: Array<{ role: "user" | "assistant"; text: string }>;
  chatInput: string;
  setChatInput: (value: string) => void;
  handleSendChatMessage: () => void;
  vaultPath: string;
  resetCurrentVaultSession: () => void;
  exportCurrentVaultSession: () => void;
  cloneCurrentVaultSession: () => void;
  sessionCloneTargetVaultPath: string;
  setSessionCloneTargetVaultPath: (path: string) => void;
  vaults: Array<{ path: string; name: string }>;
  // Asset tab
  imagePrompt: string;
  setImagePrompt: (value: string) => void;
  imageStyle: string;
  setImageStyle: (value: string) => void;
  isGeneratingImage: boolean;
  generatedImageUrl: string;
  handleGenerateImage: () => void;
  // Voice tab
  ttsText: string;
  setTtsText: (value: string) => void;
  ttsProvider: string;
  isGeneratingSpeech: boolean;
  generatedSpeechUrl: string;
  handleGenerateSpeech: () => void;
  // Backlinks tab
  backlinks: CampaignNote[];
  setSelectedNoteId: (id: string) => void;
}

export const RightDrawer: React.FC<RightDrawerProps> = (props) => {
  if (!props.isOpen) {
    return (
      <div
        style={{
          width: "40px",
          borderLeft: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "16px",
          gap: "12px",
          flexShrink: 0,
          height: "100%",
        }}
      >
        <CollapsedButton
          targetTab="scratchpad"
          icon={<PenLine size={18} />}
          title="Open Scratchpad"
          {...props}
        />
        {props.activeView !== "ai" && (
          <CollapsedButton
            targetTab="ai"
            icon={<Brain size={18} />}
            title="Open Campaign Architect"
            {...props}
          />
        )}
        <CollapsedButton
          targetTab="asset"
          icon={<Layers size={18} />}
          title="Open Asset Generator"
          {...props}
        />
        <CollapsedButton
          targetTab="backlinks"
          icon={<Link2 size={18} />}
          title="Open Backlinks"
          {...props}
        />
      </div>
    );
  }

  return (
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
      <TabBar {...props} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {props.tab === "scratchpad" && <ScratchpadTab {...props} />}
        {props.tab === "ai" && <AiTab {...props} />}
        {props.tab === "asset" && <AssetTab {...props} />}
        {props.tab === "voice" && <VoiceTab {...props} />}
        {props.tab === "backlinks" && <BacklinksTab {...props} />}
      </div>
    </div>
  );
};

const CollapsedButton: React.FC<
  Pick<RightDrawerProps, "setTab" | "setIsOpen"> & {
    targetTab: RightDrawerTab;
    icon: React.ReactNode;
    title: string;
  }
> = ({ setTab, setIsOpen, targetTab, icon, title }) => (
  <button
    onClick={() => {
      setTab(targetTab);
      setIsOpen(true);
    }}
    style={{
      background: "transparent",
      border: "none",
      color: "var(--muted)",
      padding: "8px",
      cursor: "pointer",
    }}
    title={title}
  >
    {icon}
  </button>
);

const TabButton: React.FC<
  Pick<RightDrawerProps, "tab" | "setTab"> & {
    target: RightDrawerTab;
    label: string;
  }
> = ({ tab, setTab, target, label }) => (
  <button
    onClick={() => setTab(target)}
    style={{
      background: tab === target ? "var(--border)" : "transparent",
      border: "none",
      color: tab === target ? "var(--accent)" : "var(--muted)",
      padding: "6px 8px",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "11px",
      fontWeight: 600,
    }}
  >
    {label}
  </button>
);

const TabBar: React.FC<RightDrawerProps> = ({
  activeView,
  tab,
  setTab,
  setIsOpen,
}) => (
  <div
    style={{
      display: "flex",
      borderBottom: "1px solid var(--border)",
      background: "var(--surface)",
      alignItems: "center",
      padding: "4px 8px",
      gap: "2px",
      flexShrink: 0,
    }}
  >
    <TabButton tab={tab} setTab={setTab} target="scratchpad" label="Scratch" />
    {activeView !== "ai" && (
      <TabButton tab={tab} setTab={setTab} target="ai" label="Architect" />
    )}
    <TabButton tab={tab} setTab={setTab} target="asset" label="Image" />
    <TabButton tab={tab} setTab={setTab} target="voice" label="Voice" />
    <TabButton tab={tab} setTab={setTab} target="backlinks" label="Links" />
    <button
      onClick={() => setIsOpen(false)}
      style={{
        marginLeft: "auto",
        background: "transparent",
        border: "none",
        color: "var(--muted)",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "bold",
        padding: "2px 8px",
      }}
      title="Collapse Sidebar"
    >
      »
    </button>
  </div>
);

const ScratchpadTab: React.FC<RightDrawerProps> = ({
  scratchpadText,
  setScratchpadText,
  diceNotation,
  setDiceNotation,
  diceHistory,
  rollDiceNotation,
  pluginsList,
  handleRollCharacterSheet,
  handleEvaluateEncounterThreat,
}) => (
  <div
    style={{
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      height: "100%",
      overflowY: "auto",
    }}
  >
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--accent)",
      }}
    >
      Secret GM Scratchpad
    </span>

    <textarea
      value={scratchpadText}
      onChange={(e) => setScratchpadText(e.target.value)}
      placeholder="Jot down quick combat initiative, secret notes, or draft content..."
      style={{
        minHeight: "150px",
        width: "100%",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        color: "var(--fg)",
        fontFamily: "var(--font-body)",
        fontSize: "13px",
        padding: "8px",
        resize: "vertical",
        outline: "none",
      }}
    />

    <DiceRoller
      diceNotation={diceNotation}
      setDiceNotation={setDiceNotation}
      diceHistory={diceHistory}
      rollDiceNotation={rollDiceNotation}
    />

    <PluginButtons
      pluginsList={pluginsList}
      handleRollCharacterSheet={handleRollCharacterSheet}
      handleEvaluateEncounterThreat={handleEvaluateEncounterThreat}
    />
  </div>
);

const DiceRoller: React.FC<
  Pick<
    RightDrawerProps,
    "diceNotation" | "setDiceNotation" | "diceHistory" | "rollDiceNotation"
  >
> = ({ diceNotation, setDiceNotation, diceHistory, rollDiceNotation }) => (
  <div
    style={{
      borderTop: "1px solid var(--border)",
      paddingTop: "12px",
    }}
  >
    <span
      style={{
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        color: "var(--muted)",
        display: "block",
        marginBottom: "8px",
      }}
    >
      Dice Roller
    </span>
    <div style={{ display: "flex", gap: "6px" }}>
      <input
        type="text"
        value={diceNotation}
        onChange={(e) => setDiceNotation(e.target.value)}
        placeholder="e.g. 2d20+5, d6"
        style={{
          flex: 1,
          padding: "6px 8px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          color: "var(--fg)",
          fontSize: "12px",
          outline: "none",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") rollDiceNotation(diceNotation);
        }}
      />
      <button
        className="dice-btn"
        style={{
          padding: "6px 12px",
          fontSize: "12px",
          cursor: "pointer",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          color: "var(--fg)",
        }}
        onClick={() => rollDiceNotation(diceNotation)}
        type="button"
      >
        Roll
      </button>
    </div>
    {diceHistory.length > 0 && (
      <div
        style={{
          marginTop: "8px",
          maxHeight: "80px",
          overflowY: "auto",
          background: "var(--bg)",
          borderRadius: "4px",
          padding: "6px",
          fontSize: "11px",
          color: "var(--accent)",
        }}
      >
        {diceHistory.slice(0, 5).map((entry, i) => (
          <div
            key={i}
            style={{
              borderBottom:
                i < diceHistory.slice(0, 5).length - 1
                  ? "1px solid var(--border)"
                  : "none",
              padding: "2px 0",
            }}
          >
            {entry}
          </div>
        ))}
      </div>
    )}
  </div>
);

const PluginButtons: React.FC<
  Pick<
    RightDrawerProps,
    | "pluginsList"
    | "handleRollCharacterSheet"
    | "handleEvaluateEncounterThreat"
  >
> = ({ pluginsList, handleRollCharacterSheet, handleEvaluateEncounterThreat }) => (
  <div
    style={{
      borderTop: "1px solid var(--border)",
      paddingTop: "12px",
      marginBottom: "16px",
    }}
  >
    <span
      style={{
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        color: "var(--muted)",
        display: "block",
        marginBottom: "8px",
      }}
    >
      GM Plugins
    </span>
    {pluginsList.length > 0 ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pluginsList.map((plugin) => {
          if (plugin.id === "character-roller" && plugin.active) {
            return (
              <button
                key={plugin.id}
                className="btn btn-sm"
                style={{
                  width: "100%",
                  padding: "6px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
                onClick={handleRollCharacterSheet}
                type="button"
              >
                Roll Ability Sheet
              </button>
            );
          }
          if (plugin.id === "threat-evaluator" && plugin.active) {
            return (
              <button
                key={plugin.id}
                className="btn btn-sm"
                style={{
                  width: "100%",
                  padding: "6px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
                onClick={handleEvaluateEncounterThreat}
                type="button"
              >
                Evaluate Threat
              </button>
            );
          }
          return null;
        })}
      </div>
    ) : (
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontStyle: "italic",
        }}
      >
        No active plugins
      </div>
    )}
  </div>
);

const AiTab: React.FC<RightDrawerProps> = ({
  currentChatMessages,
  chatInput,
  setChatInput,
  handleSendChatMessage,
  vaultPath,
  resetCurrentVaultSession,
  exportCurrentVaultSession,
  cloneCurrentVaultSession,
  sessionCloneTargetVaultPath,
  setSessionCloneTargetVaultPath,
  vaults,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        padding: "16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--accent)",
        }}
      >
        Campaign Architect
      </span>

      <div
        style={{
          display: "flex",
          gap: "6px",
          marginTop: "8px",
          flexWrap: "wrap",
        }}
      >
        <AiActionButton
          onClick={resetCurrentVaultSession}
          disabled={!vaultPath}
          label="Reset Memory"
        />
        <AiActionButton
          onClick={exportCurrentVaultSession}
          disabled={!vaultPath}
          label="Export"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "6px",
          marginTop: "8px",
          alignItems: "center",
        }}
      >
        <select
          value={sessionCloneTargetVaultPath}
          onChange={(e) => setSessionCloneTargetVaultPath(e.target.value)}
          style={{
            flex: 1,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            padding: "4px 6px",
            fontSize: 10,
            borderRadius: 4,
            color: "var(--fg)",
            cursor: "pointer",
          }}
        >
          <option value="">Clone to vault...</option>
          {vaults
            .filter((item) => item.path !== vaultPath)
            .map((item) => (
              <option key={item.path} value={item.path}>
                {item.name}
              </option>
            ))}
        </select>
        <AiActionButton
          onClick={cloneCurrentVaultSession}
          disabled={!vaultPath || !sessionCloneTargetVaultPath}
          label="Clone"
        />
      </div>
    </div>

    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {currentChatMessages.map((msg, i) => (
        <div
          key={i}
          className={`chat-bubble ${msg.role}`}
          style={{ fontSize: "12px", padding: "8px 12px" }}
        >
          {msg.text}
        </div>
      ))}
    </div>
    <div
      style={{
        padding: "12px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        gap: "6px",
      }}
    >
      <input
        style={{
          flex: 1,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          padding: "6px 8px",
          fontFamily: "var(--font-body)",
          fontSize: "12px",
          outline: "none",
          borderRadius: 4,
          color: "var(--fg)",
        }}
        placeholder="Ask Architect..."
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSendChatMessage();
        }}
      />
    </div>
  </div>
);

const AiActionButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  label: string;
}> = ({ onClick, disabled, label }) => (
  <button
    className="btn btn-sm"
    style={{
      padding: "4px 8px",
      fontSize: "10px",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    }}
    onClick={onClick}
    disabled={disabled}
    type="button"
  >
    {label}
  </button>
);

const AssetTab: React.FC<RightDrawerProps> = ({
  imagePrompt,
  setImagePrompt,
  imageStyle,
  setImageStyle,
  isGeneratingImage,
  generatedImageUrl,
  handleGenerateImage,
}) => (
  <div
    style={{
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}
  >
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--accent)",
      }}
    >
      Local Stable Diffusion
    </span>

    <div className="field-group">
      <label
        className="field-label"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--muted)",
          display: "block",
          marginBottom: "4px",
        }}
      >
        Prompt
      </label>
      <textarea
        value={imagePrompt}
        onChange={(e) => setImagePrompt(e.target.value)}
        placeholder="A dramatic fantasy landscape, highly detailed..."
        style={{
          height: "60px",
          resize: "none",
          fontSize: "12px",
          padding: "6px 8px",
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--fg)",
          fontFamily: "var(--font-body)",
        }}
      />
    </div>

    <div className="field-group">
      <label
        className="field-label"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--muted)",
          display: "block",
          marginBottom: "4px",
        }}
      >
        Style
      </label>
      <select
        value={imageStyle}
        onChange={(e) => setImageStyle(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--fg)",
          fontSize: "12px",
        }}
      >
        <option value="Fantasy Portrait">Fantasy Portrait</option>
        <option value="Oil Painting">Oil Painting</option>
        <option value="Ink Sketch">Ink Sketch</option>
        <option value="Vibrant Concept Art">Vibrant Concept Art</option>
      </select>
    </div>

    <button
      className="btn btn-sm btn-primary"
      style={{
        width: "100%",
        marginTop: "4px",
        padding: "8px",
        cursor: "pointer",
      }}
      onClick={handleGenerateImage}
      disabled={isGeneratingImage}
      type="button"
    >
      {isGeneratingImage ? "Rendering SD..." : "Generate Image"}
    </button>

    <div
      style={{
        marginTop: "12px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "8px",
        minHeight: "150px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {isGeneratingImage ? (
        <span
          style={{
            fontSize: "11px",
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          Rendering via stable-diffusion-onnx...
        </span>
      ) : generatedImageUrl ? (
        <img
          src={generatedImageUrl}
          alt="Generated asset"
          style={{
            width: "100%",
            height: "auto",
            borderRadius: "4px",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: "11px",
            color: "var(--muted)",
          }}
        >
          No asset rendered
        </span>
      )}
    </div>
  </div>
);

const VoiceTab: React.FC<RightDrawerProps> = ({
  ttsText,
  setTtsText,
  ttsProvider,
  isGeneratingSpeech,
  generatedSpeechUrl,
  handleGenerateSpeech,
}) => (
  <div
    style={{
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}
  >
    <span
      className="panel-title"
      style={{ marginBottom: 0, fontSize: "14px", fontWeight: 600 }}
    >
      Text-to-Speech
    </span>
    <textarea
      style={{
        width: "100%",
        minHeight: "80px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "8px",
        color: "var(--fg)",
        fontSize: "12px",
        fontFamily: "var(--font-body)",
        resize: "vertical",
      }}
      placeholder="Enter text to convert to speech..."
      value={ttsText}
      onChange={(e) => setTtsText(e.target.value)}
    />
    <div style={{ fontSize: "10px", color: "var(--muted)" }}>
      Provider: {ttsProvider}
      {ttsProvider === "local" &&
        " (not implemented — configure OpenAI or ElevenLabs in Settings)"}
    </div>
    <button
      className="btn btn-sm btn-primary"
      style={{
        width: "100%",
        padding: "8px",
        cursor: "pointer",
      }}
      onClick={handleGenerateSpeech}
      disabled={isGeneratingSpeech || !ttsText.trim()}
      type="button"
    >
      {isGeneratingSpeech ? "Generating..." : "Generate Speech"}
    </button>
    {generatedSpeechUrl && (
      <div
        style={{
          marginTop: "8px",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "8px",
          background: "var(--bg)",
        }}
      >
        <audio src={generatedSpeechUrl} controls style={{ width: "100%" }} />
      </div>
    )}
  </div>
);

const BacklinksTab: React.FC<
  Pick<RightDrawerProps, "backlinks" | "setSelectedNoteId">
> = ({ backlinks, setSelectedNoteId }) => (
  <div
    style={{
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}
  >
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--accent)",
      }}
    >
      Incoming Backlinks
    </span>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {backlinks.length === 0 ? (
        <div
          style={{
            fontSize: "12px",
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          No incoming links to this note.
        </div>
      ) : (
        backlinks.map((note) => (
          <button
            key={note.id}
            className="nav-item"
            onClick={() => setSelectedNoteId(note.id)}
            style={{
              padding: "6px 8px",
              fontSize: "12px",
              textAlign: "left",
              justifyContent: "flex-start",
              cursor: "pointer",
            }}
            type="button"
          >
            {note.title}
          </button>
        ))
      )}
    </div>
  </div>
);
