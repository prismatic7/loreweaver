import React, { useState } from "react";
import { Dice6, RotateCcw } from "lucide-react";
import { parseAndRollDice, DiceRollOutcome } from "../../utils/dice";

export interface InlineDiceBadgeProps {
  formula: string;
  onRoll?: (outcome: DiceRollOutcome) => void;
}

export const InlineDiceBadge: React.FC<InlineDiceBadgeProps> = ({
  formula,
  onRoll,
}) => {
  const [outcome, setOutcome] = useState<DiceRollOutcome | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const handleRoll = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setIsRolling(true);

    setTimeout(() => {
      const result = parseAndRollDice(formula);
      setOutcome(result);
      setIsRolling(false);

      if (onRoll) {
        onRoll(result);
      }

      // Dispatch global window event so right drawer or plugins can record roll
      try {
        window.dispatchEvent(
          new CustomEvent("loreweaver:dice-roll", {
            detail: result,
          }),
        );
      } catch {
        // Ignore environments without CustomEvent support
      }
    }, 150);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleRoll}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRoll(e);
        }
      }}
      title={outcome ? outcome.fullText : `Click to roll ${formula}`}
      aria-label={`Roll ${formula}`}
      className={`inline-dice-badge ${isRolling ? "rolling" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "1px 6px",
        margin: "0 2px",
        background: outcome ? "var(--accent-subtle, rgba(200, 150, 60, 0.15))" : "var(--surface)",
        border: outcome ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "3px",
        fontSize: "0.85em",
        fontWeight: 600,
        fontFamily: "var(--font-mono, monospace)",
        color: outcome ? "var(--accent)" : "var(--fg)",
        cursor: "pointer",
        userSelect: "none",
        verticalAlign: "middle",
        transition: "all 0.15s ease",
      }}
    >
      <Dice6
        size={12}
        style={{
          transform: isRolling ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
          color: "var(--accent)",
        }}
      />
      <span>{formula}</span>
      {outcome && (
        <>
          <span style={{ color: "var(--muted)", margin: "0 1px" }}>=</span>
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>{outcome.total}</span>
          <span title="Roll again" style={{ display: "inline-flex", alignItems: "center" }}>
            <RotateCcw
              size={10}
              style={{ color: "var(--muted)", marginLeft: "2px" }}
            />
          </span>
        </>
      )}
    </span>
  );
};
