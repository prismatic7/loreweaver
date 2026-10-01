import React, { useState } from "react";
import {
  FileText,
  BookOpen,
  Info,
  ListTodo,
  Lightbulb,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  Bug,
  Layers,
  Quote,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

export interface CalloutBlockProps {
  calloutType: string;
  title: string;
  isFoldable: boolean;
  defaultFolded: boolean;
  children: React.ReactNode;
}

const ICON_MAP: Record<string, LucideIcon> = {
  note: FileText,
  seealso: FileText,
  abstract: BookOpen,
  summary: BookOpen,
  tldr: BookOpen,
  info: Info,
  todo: ListTodo,
  tip: Lightbulb,
  hint: Lightbulb,
  important: Lightbulb,
  success: CheckCircle2,
  check: CheckCircle2,
  done: CheckCircle2,
  question: HelpCircle,
  help: HelpCircle,
  faq: HelpCircle,
  warning: AlertTriangle,
  caution: AlertTriangle,
  attention: AlertTriangle,
  failure: XCircle,
  fail: XCircle,
  missing: XCircle,
  danger: AlertOctagon,
  error: AlertOctagon,
  bug: Bug,
  example: Layers,
  quote: Quote,
  cite: Quote,
};

export const CalloutBlock: React.FC<CalloutBlockProps> = ({
  calloutType,
  title,
  isFoldable,
  defaultFolded,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(!defaultFolded);
  const IconComponent = ICON_MAP[calloutType.toLowerCase()] || Info;

  return (
    <div
      className={`callout-container callout-${calloutType.toLowerCase()} ${isFoldable ? "callout-foldable" : ""}`}
      data-callout={calloutType}
    >
      <div
        className="callout-header"
        onClick={() => isFoldable && setIsOpen((prev) => !prev)}
        style={{ cursor: isFoldable ? "pointer" : "default" }}
      >
        <div className="callout-header-content">
          <IconComponent className="callout-icon" size={16} />
          <span className="callout-title">{title}</span>
        </div>
        {isFoldable && (
          <span className="callout-fold-indicator">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </div>
      {isOpen && <div className="callout-body">{children}</div>}
    </div>
  );
};
