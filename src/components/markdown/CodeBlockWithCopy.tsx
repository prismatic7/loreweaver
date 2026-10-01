import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export interface CodeBlockWithCopyProps {
  className?: string;
  children: React.ReactNode;
}

export const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1].toUpperCase() : "TEXT";

  const handleCopy = () => {
    // Extract text recursively from children
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (typeof node === "number") return String(node);
      if (!node) return "";
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (React.isValidElement(node) && node.props && (node.props as any).children) {
        return extractText((node.props as any).children);
      }
      return "";
    };

    const text = extractText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy code to clipboard:", err);
    });
  };

  return (
    <div className="codeblock-container">
      <div className="codeblock-header">
        <span className="codeblock-lang">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="codeblock-copy-btn"
          title="Copy code to clipboard"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <pre className="codeblock-pre">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};
