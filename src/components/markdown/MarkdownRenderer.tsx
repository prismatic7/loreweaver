import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CampaignNote } from "../../types";
import { remarkCallouts } from "../../utils/markdown/remarkCallouts";
import { remarkWikiLinks } from "../../utils/markdown/remarkWikiLinks";
import { remarkEmbeds } from "../../utils/markdown/remarkEmbeds";
import { remarkInline } from "../../utils/markdown/remarkInline";
import { CalloutBlock } from "./CalloutBlock";
import { CodeBlockWithCopy } from "./CodeBlockWithCopy";
import { InteractiveTaskCheckbox } from "./InteractiveTaskCheckbox";
import { WikiLinkAnchor } from "./WikiLinkAnchor";
import { TranscludedNoteCard } from "./TranscludedNoteCard";
import "./markdown.css";

export interface MarkdownRendererProps {
  content: string;
  notes?: CampaignNote[];
  selectedNoteId?: string;
  vaultPath?: string;
  onSelectNote?: (noteId: string) => void;
  onCreateNote?: (title: string) => void;
  onToggleTask?: (taskIndex: number, newChecked: boolean) => void;
  embedStack?: Set<string>;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  notes = [],
  selectedNoteId = "",
  vaultPath = "",
  onSelectNote = () => {},
  onCreateNote = () => {},
  onToggleTask,
  embedStack = new Set<string>(),
}) => {
  // Strip YAML frontmatter at start of note for clean prose rendering
  const cleanedContent = useMemo(() => {
    if (!content) return "";
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }, [content]);

  const resolveTargetNote = (targetName: string): CampaignNote | null => {
    const normalized = targetName.trim().toLowerCase();
    if (!normalized) return null;

    // 1. Exact match on title
    const exactTitle = notes.find((n) => n.title.trim().toLowerCase() === normalized);
    if (exactTitle) return exactTitle;

    // 2. Leaf filename match
    const leafMatch = notes.find((n) => {
      const stem = (n.path.split("/").pop() || "").replace(/\.md$/i, "").toLowerCase();
      return stem === normalized;
    });
    if (leafMatch) return leafMatch;

    // 3. Alias match
    const aliasMatch = notes.find((n) => {
      const aliases = n.frontmatter.aliases ?? n.frontmatter.alias;
      if (Array.isArray(aliases)) {
        return aliases.some((a) => String(a).trim().toLowerCase() === normalized);
      }
      if (typeof aliases === "string") {
        return aliases.trim().toLowerCase() === normalized;
      }
      return false;
    });
    return aliasMatch || null;
  };

  const resolveAssetSrc = (target: string): string => {
    if (!vaultPath) return target;
    const activeNote = notes.find((n) => n.id === selectedNoteId);
    let absolutePath = "";

    if (target.startsWith("_assets/") || target.includes("/_assets/")) {
      const cleanRel = target.replace(/^[./]+/, "");
      if (activeNote) {
        const parts = activeNote.path.split("/");
        parts.pop();
        const parentRelative = parts.join("/");
        const separator = parentRelative ? "/" : "";
        absolutePath = `${vaultPath}${separator}${parentRelative}/${cleanRel}`;
      } else {
        absolutePath = `${vaultPath}/${cleanRel}`;
      }
    } else {
      absolutePath = `${vaultPath}/${target.replace(/^[./]+/, "")}`;
    }

    try {
      return convertFileSrc(absolutePath);
    } catch {
      return target;
    }
  };

  let currentCheckboxIndex = 0;

  const components: Components = {
    div: ({ _node, children, ...props }: any) => {
      // Obsidian Callout
      if (props["data-callout"]) {
        const calloutType = props["data-callout"] || "note";
        const isFoldable = props["data-foldable"] === "true";
        const defaultFolded = props["data-folded"] === "true";
        const title = props["data-title"] || calloutType;
        return (
          <CalloutBlock
            calloutType={calloutType}
            title={title}
            isFoldable={isFoldable}
            defaultFolded={defaultFolded}
          >
            {children}
          </CalloutBlock>
        );
      }

      // Obsidian Note Transclusion
      if (props["data-note-target"]) {
        const target = props["data-note-target"];
        const heading = props["data-heading"];
        return (
          <TranscludedNoteCard
            target={target}
            heading={heading}
            notes={notes}
            embedStack={embedStack}
            onSelectNote={onSelectNote}
            renderChildMarkdown={(childContent, nextStack) => (
              <MarkdownRenderer
                content={childContent}
                notes={notes}
                selectedNoteId={selectedNoteId}
                vaultPath={vaultPath}
                onSelectNote={onSelectNote}
                onCreateNote={onCreateNote}
                onToggleTask={onToggleTask}
                embedStack={nextStack}
              />
            )}
          />
        );
      }

      return <div {...props}>{children}</div>;
    },

    a: ({ href, children, ...props }: any) => {
      // Obsidian WikiLink
      if (props["data-target"] !== undefined) {
        const target = props["data-target"] || "";
        const alias = props["data-alias"] || target;
        const heading = props["data-heading"];
        const matched = resolveTargetNote(target);
        return (
          <WikiLinkAnchor
            target={target}
            alias={alias}
            heading={heading}
            targetNoteId={matched ? matched.id : null}
            onSelectNote={onSelectNote}
            onCreateNote={onCreateNote}
          />
        );
      }

      // Standard links
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="markdown-external-link"
          {...props}
        >
          {children}
        </a>
      );
    },

    span: ({ children, ...props }: any) => {
      // Obsidian Media Embed
      if (props["data-media-target"]) {
        const target = props["data-media-target"];
        const width = props["data-width"];
        const height = props["data-height"];
        const ext = target.split(".").pop()?.toLowerCase() || "";
        const resolvedSrc = resolveAssetSrc(target);

        if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
          return <audio src={resolvedSrc} controls className="markdown-audio" style={{ width: "100%" }} />;
        }
        if (["mp4", "webm", "ogv", "mov"].includes(ext)) {
          return (
            <video
              src={resolvedSrc}
              controls
              className="markdown-video"
              style={{
                maxWidth: width ? `${width}px` : "100%",
                maxHeight: height ? `${height}px` : undefined,
              }}
            />
          );
        }
        return (
          <img
            src={resolvedSrc}
            alt={target}
            className="markdown-image"
            style={{
              maxWidth: width ? `${width}px` : "100%",
              maxHeight: height ? `${height}px` : undefined,
              borderRadius: 2,
            }}
          />
        );
      }

      // Tag Pill
      if (props["data-tag"]) {
        return <span className="markdown-tag-pill">{children}</span>;
      }

      return <span {...props}>{children}</span>;
    },

    mark: ({ children }: any) => {
      return <mark className="markdown-highlight">{children}</mark>;
    },

    input: ({ type, checked, ...props }: any) => {
      if (type === "checkbox") {
        const taskIdx = currentCheckboxIndex++;
        return (
          <InteractiveTaskCheckbox
            checked={!!checked}
            taskIndex={taskIdx}
            onToggleTask={onToggleTask}
          />
        );
      }
      return <input type={type} {...props} />;
    },

    table: ({ children }: any) => (
      <div className="markdown-table-wrapper">
        <table className="markdown-table">{children}</table>
      </div>
    ),

    pre: ({ children }: any) => {
      return <>{children}</>;
    },

    code: ({ className, children, ...props }: any) => {
      const isCodeFence = Boolean(className) || (typeof children === "string" && children.includes("\n"));
      if (isCodeFence) {
        return <CodeBlockWithCopy className={className}>{children}</CodeBlockWithCopy>;
      }
      return (
        <code className="markdown-inline-code" {...props}>
          {children}
        </code>
      );
    },

    blockquote: ({ children }: any) => (
      <blockquote className="markdown-quote">{children}</blockquote>
    ),
  };

  return (
    <div className="markdown-preview-container">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkCallouts,
          remarkWikiLinks,
          remarkEmbeds,
          remarkInline,
        ]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
};
