import React from "react";

export interface InteractiveTaskCheckboxProps {
  checked: boolean;
  taskIndex: number;
  onToggleTask?: (taskIndex: number, newChecked: boolean) => void;
}

export const InteractiveTaskCheckbox: React.FC<InteractiveTaskCheckboxProps> = ({
  checked,
  taskIndex,
  onToggleTask,
}) => {
  return (
    <input
      type="checkbox"
      className="markdown-task-checkbox"
      checked={checked}
      onChange={(e) => onToggleTask?.(taskIndex, e.target.checked)}
      disabled={!onToggleTask}
      style={{
        cursor: onToggleTask ? "pointer" : "default",
        marginRight: "6px",
      }}
    />
  );
};
