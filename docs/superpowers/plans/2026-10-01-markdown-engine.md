# Modern Markdown Engine (GFM & Obsidian Flavoured Markdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, AST-based Markdown engine supporting full GitHub-Flavored Markdown (GFM) and Obsidian-Flavored Markdown (OFM: callouts, wikilinks, embeds, task lists, math/KaTeX, syntax-highlighted code blocks, highlights, and tags).

**Architecture:** An AST pipeline built on `unified`, `remark-parse`, `remark-gfm`, `remark-math`, custom remark AST transformers (`remarkCallouts`, `remarkWikiLinks`, `remarkEmbeds`, `remarkInline`), `remark-rehype`, `rehype-katex`, and `rehype-highlight`. Custom React components render interactive callouts, interactive auto-saving task checkboxes, code blocks with copy buttons, and transcluded notes with recursion guards.

**Tech Stack:** React 19, TypeScript 5, `react-markdown`, `remark-parse`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`, `rehype-highlight`, `unist-util-visit`, Lucide React, Tauri v2.

## Global Constraints

- Never use regex string replacement on raw markdown where an AST visitor should be used.
- Code blocks (both backtick spans and fenced blocks) must never have their contents parsed as markdown tokens (wikilinks, callouts, or tags).
- Circular note transclusions must be caught and prevented via an `embedStack: Set<string>` context with a maximum depth of 3.
- All interactive components must adhere to the "Tactile Ledger" aesthetic and respect dark mode styling.
- All existing tests (191 tests across 28 test suites) and TypeScript compilation gates must stay green throughout.

---

### Task 1: Install & Configure Markdown Extension Dependencies

**Files:**
- Modify: `package.json`
- Modify: `src/index.css`
- Test: Build verification (`npm run build`)

**Interfaces:**
- Consumes: None
- Produces: Package dependencies (`remark-math`, `rehype-katex`, `katex`, `rehype-highlight`, `unist-util-visit`) and KaTeX CSS styles loaded in app bundle.

- [ ] **Step 1: Install packages**

Run:
```bash
npm install remark-math@^6.0.0 rehype-katex@^7.0.1 katex@^0.16.47 rehype-highlight@^7.0.2 unist-util-visit@^5.1.0
npm install -D @types/katex@^0.16.8
```

- [ ] **Step 2: Import KaTeX CSS in `src/index.css`**

Add at the top of `src/index.css`:
```css
@import "katex/dist/katex.min.css";
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build && npm run test`
Expected: Build passes with 0 errors; all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/index.css
git commit -m "chore: install remark-math, rehype-katex, rehype-highlight and unist utilities"
```

---

### Task 2: Obsidian Callout AST Transformer (`remarkCallouts`)

**Files:**
- Create: `src/utils/markdown/remarkCallouts.ts`
- Create: `src/utils/markdown/remarkCallouts.test.ts`

**Interfaces:**
- Consumes: `unified`, `unist-util-visit`, `mdast`
- Produces: `remarkCallouts()` Remark plugin that transforms `blockquote` nodes matching `> [!TYPE][+-] [Title]` into `callout` AST nodes with data attributes:
  ```ts
  interface CalloutData {
    calloutType: string;
    isFoldable: boolean;
    defaultFolded: boolean;
    title: string;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/markdown/remarkCallouts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkCallouts } from "./remarkCallouts";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkCallouts).parse(md);
  const transformed = await unified().use(remarkParse).use(remarkCallouts).run(tree);
  return transformed;
};

describe("remarkCallouts", () => {
  it("transforms a basic note callout", async () => {
    const md = "> [!NOTE]\n> This is a note.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.data.calloutType).toBe("note");
    expect(callout.data.isFoldable).toBe(false);
    expect(callout.data.title).toBe("Note");
  });

  it("transforms a collapsible callout with custom title", async () => {
    const md = "> [!TIP]- Hidden Secret\n> The secret entrance is behind the waterfall.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.data.calloutType).toBe("tip");
    expect(callout.data.isFoldable).toBe(true);
    expect(callout.data.defaultFolded).toBe(true);
    expect(callout.data.title).toBe("Hidden Secret");
  });

  it("leaves standard blockquotes unchanged", async () => {
    const md = "> Just a normal quote.";
    const tree = await process(md) as any;
    expect(tree.children[0].type).toBe("blockquote");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/markdown/remarkCallouts.test.ts`
Expected: FAIL with module not found or export missing.

- [ ] **Step 3: Implement `remarkCallouts.ts`**

Create `src/utils/markdown/remarkCallouts.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root, Blockquote, Paragraph, Text } from "mdast";
import type { Plugin } from "unified";

const CALLOUT_REGEX = /^\[!([a-zA-Z0-9_-]+)\]([+-])?(?:\s+(.*))?$/;

export interface CalloutNode extends Blockquote {
  type: "callout" as any;
  data: {
    calloutType: string;
    isFoldable: boolean;
    defaultFolded: boolean;
    title: string;
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

export const remarkCallouts: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote, index, parent) => {
      if (!node.children || node.children.length === 0) return;
      const firstChild = node.children[0];
      if (firstChild.type !== "paragraph" || !firstChild.children || firstChild.children.length === 0) {
        return;
      }

      const firstInline = firstChild.children[0];
      if (firstInline.type !== "text") return;

      const lines = firstInline.value.split("\n");
      const firstLine = lines[0].trim();
      const match = CALLOUT_REGEX.exec(firstLine);
      if (!match) return;

      const rawType = match[1].toLowerCase();
      const foldModifier = match[2];
      const customTitle = match[3]?.trim();

      const isFoldable = foldModifier === "+" || foldModifier === "-";
      const defaultFolded = foldModifier === "-";
      const title = customTitle || (rawType.charAt(0).toUpperCase() + rawType.slice(1));

      // Remove the header line from the first paragraph
      if (lines.length > 1) {
        firstInline.value = lines.slice(1).join("\n");
      } else {
        firstChild.children.shift();
        if (firstChild.children.length === 0) {
          node.children.shift();
        }
      }

      const calloutNode: CalloutNode = {
        ...node,
        type: "callout" as any,
        data: {
          calloutType: rawType,
          isFoldable,
          defaultFolded,
          title,
          hName: "div",
          hProperties: {
            className: `callout-block callout-${rawType}`,
            "data-callout": rawType,
            "data-foldable": isFoldable ? "true" : "false",
            "data-folded": defaultFolded ? "true" : "false",
            "data-title": title,
          },
        },
      };

      if (parent && typeof index === "number") {
        parent.children[index] = calloutNode as any;
      }
    });
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/markdown/remarkCallouts.test.ts`
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/utils/markdown/remarkCallouts.ts src/utils/markdown/remarkCallouts.test.ts
git commit -m "feat(markdown): implement remarkCallouts AST plugin for Obsidian callouts"
```

---

### Task 3: Obsidian WikiLinks & Anchors AST Transformer (`remarkWikiLinks`)

**Files:**
- Create: `src/utils/markdown/remarkWikiLinks.ts`
- Create: `src/utils/markdown/remarkWikiLinks.test.ts`

**Interfaces:**
- Consumes: `unified`, `unist-util-visit`, `mdast`
- Produces: `remarkWikiLinks()` plugin transforming `[[Target|Alias]]` and `[[Target#Heading]]` outside code blocks into `wikiLink` nodes:
  ```ts
  interface WikiLinkData {
    target: string;
    alias?: string;
    heading?: string;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/markdown/remarkWikiLinks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkWikiLinks } from "./remarkWikiLinks";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkWikiLinks).parse(md);
  return await unified().use(remarkParse).use(remarkWikiLinks).run(tree);
};

describe("remarkWikiLinks", () => {
  it("transforms standard wikilinks", async () => {
    const md = "Visit [[Waterdeep]] today.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const link = p.children[1];
    expect(link.type).toBe("wikiLink");
    expect(link.data.target).toBe("Waterdeep");
    expect(link.data.alias).toBe("Waterdeep");
  });

  it("transforms aliased wikilinks and heading anchors", async () => {
    const md = "See [[Waterdeep#Taverns|The Yawning Portal]].";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const link = p.children[1];
    expect(link.type).toBe("wikiLink");
    expect(link.data.target).toBe("Waterdeep");
    expect(link.data.heading).toBe("Taverns");
    expect(link.data.alias).toBe("The Yawning Portal");
  });

  it("does not transform wikilinks inside inline code", async () => {
    const md = "Code with `[[Waterdeep]]` is literal.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    expect(p.children[1].type).toBe("inlineCode");
    expect(p.children[1].value).toBe("[[Waterdeep]]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/markdown/remarkWikiLinks.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `remarkWikiLinks.ts`**

Create `src/utils/markdown/remarkWikiLinks.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const WIKILINK_REGEX = /\[\[([^\]\n]+)\]\]/g;

export interface WikiLinkNode {
  type: "wikiLink";
  data: {
    target: string;
    alias: string;
    heading?: string;
    hName: string;
    hProperties: Record<string, string>;
  };
  children: Array<{ type: "text"; value: string }>;
}

export const remarkWikiLinks: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if (parent.type === "code" as any || parent.type === "inlineCode" as any) return;

      const value = node.value;
      if (!value.includes("[[")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      WIKILINK_REGEX.lastIndex = 0;

      while ((match = WIKILINK_REGEX.exec(value)) !== null) {
        const start = match.index;
        if (start > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.slice(lastIndex, start),
          });
        }

        const rawContent = match[1].trim();
        const [targetAndHeading, aliasPart] = rawContent.split("|");
        const [targetPart, headingPart] = targetAndHeading.split("#");

        const target = targetPart?.trim() || "";
        const heading = headingPart?.trim();
        const alias = aliasPart?.trim() || (heading && !target ? `#${heading}` : target || rawContent);

        newChildren.push({
          type: "wikiLink",
          data: {
            target,
            alias,
            heading,
            hName: "a",
            hProperties: {
              className: "markdown-wikilink",
              "data-target": target,
              "data-alias": alias,
              ...(heading ? { "data-heading": heading } : {}),
            },
          },
          children: [{ type: "text", value: alias }],
        });

        lastIndex = WIKILINK_REGEX.lastIndex;
      }

      if (lastIndex < value.length) {
        newChildren.push({
          type: "text",
          value: value.slice(lastIndex),
        });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/markdown/remarkWikiLinks.test.ts`
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/utils/markdown/remarkWikiLinks.ts src/utils/markdown/remarkWikiLinks.test.ts
git commit -m "feat(markdown): implement remarkWikiLinks AST plugin for Obsidian wikilinks"
```

---

### Task 4: Obsidian Embeds & Transclusions AST Transformer (`remarkEmbeds`)

**Files:**
- Create: `src/utils/markdown/remarkEmbeds.ts`
- Create: `src/utils/markdown/remarkEmbeds.test.ts`

**Interfaces:**
- Consumes: `unified`, `unist-util-visit`, `mdast`
- Produces: `remarkEmbeds()` plugin transforming `![[Target]]` and `![[Target|width]]` into `noteEmbed` or `mediaEmbed` AST nodes:
  ```ts
  interface EmbedData {
    isMedia: boolean;
    target: string;
    heading?: string;
    width?: number;
    height?: number;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/markdown/remarkEmbeds.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkEmbeds } from "./remarkEmbeds";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkEmbeds).parse(md);
  return await unified().use(remarkParse).use(remarkEmbeds).run(tree);
};

describe("remarkEmbeds", () => {
  it("transforms note embeds", async () => {
    const md = "Check this:\n\n![[Chapter 1]]";
    const tree = await process(md) as any;
    const embed = tree.children[1].children[0];
    expect(embed.type).toBe("noteEmbed");
    expect(embed.data.target).toBe("Chapter 1");
  });

  it("transforms media embeds with dimensions", async () => {
    const md = "![[map.png|400x300]]";
    const tree = await process(md) as any;
    const embed = tree.children[0].children[0];
    expect(embed.type).toBe("mediaEmbed");
    expect(embed.data.target).toBe("map.png");
    expect(embed.data.width).toBe(400);
    expect(embed.data.height).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/markdown/remarkEmbeds.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `remarkEmbeds.ts`**

Create `src/utils/markdown/remarkEmbeds.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const EMBED_REGEX = /!\[\[([^\]\n]+)\]\]/g;
const MEDIA_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp",
  "mp3", "ogg", "wav", "m4a",
  "mp4", "webm", "ogv", "mov",
  "pdf",
]);

export const remarkEmbeds: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if (parent.type === "code" as any || parent.type === "inlineCode" as any) return;

      const value = node.value;
      if (!value.includes("![[")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      EMBED_REGEX.lastIndex = 0;

      while ((match = EMBED_REGEX.exec(value)) !== null) {
        const start = match.index;
        if (start > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.slice(lastIndex, start),
          });
        }

        const rawContent = match[1].trim();
        const [targetAndHeading, dimensionPart] = rawContent.split("|");
        const [targetPart, headingPart] = targetAndHeading.split("#");

        const target = targetPart?.trim() || "";
        const heading = headingPart?.trim();
        const ext = target.split(".").pop()?.toLowerCase() || "";
        const isMedia = MEDIA_EXTS.has(ext);

        let width: number | undefined;
        let height: number | undefined;
        if (dimensionPart) {
          const dims = dimensionPart.trim().split("x");
          if (dims.length === 2) {
            width = parseInt(dims[0], 10) || undefined;
            height = parseInt(dims[1], 10) || undefined;
          } else if (dims.length === 1) {
            width = parseInt(dims[0], 10) || undefined;
          }
        }

        if (isMedia) {
          newChildren.push({
            type: "mediaEmbed",
            data: {
              target,
              width,
              height,
              hName: "span",
              hProperties: {
                className: "markdown-media-embed",
                "data-media-target": target,
                ...(width ? { "data-width": String(width) } : {}),
                ...(height ? { "data-height": String(height) } : {}),
              },
            },
          });
        } else {
          newChildren.push({
            type: "noteEmbed",
            data: {
              target,
              heading,
              hName: "div",
              hProperties: {
                className: "markdown-note-embed",
                "data-note-target": target,
                ...(heading ? { "data-heading": heading } : {}),
              },
            },
          });
        }

        lastIndex = EMBED_REGEX.lastIndex;
      }

      if (lastIndex < value.length) {
        newChildren.push({
          type: "text",
          value: value.slice(lastIndex),
        });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/markdown/remarkEmbeds.test.ts`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/utils/markdown/remarkEmbeds.ts src/utils/markdown/remarkEmbeds.test.ts
git commit -m "feat(markdown): implement remarkEmbeds AST plugin for transclusions and media"
```

---

### Task 5: Extended Markdown Highlights & Tags AST Transformer (`remarkInline`)

**Files:**
- Create: `src/utils/markdown/remarkInline.ts`
- Create: `src/utils/markdown/remarkInline.test.ts`

**Interfaces:**
- Consumes: `unified`, `unist-util-visit`, `mdast`
- Produces: `remarkInline()` plugin transforming `==highlight==` and `#tag` patterns outside code into semantic AST nodes.

- [ ] **Step 1: Write the failing test**

Create `src/utils/markdown/remarkInline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkInline } from "./remarkInline";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkInline).parse(md);
  return await unified().use(remarkParse).use(remarkInline).run(tree);
};

describe("remarkInline", () => {
  it("transforms ==highlights== into mark nodes", async () => {
    const md = "This is ==critical lore== to remember.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const mark = p.children[1];
    expect(mark.type).toBe("highlight");
    expect(mark.data.hName).toBe("mark");
  });

  it("transforms #tags into tag nodes", async () => {
    const md = "Tagged with #faction/harpers and #npc.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const tag1 = p.children[1];
    expect(tag1.type).toBe("tagPill");
    expect(tag1.data.tag).toBe("faction/harpers");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/markdown/remarkInline.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `remarkInline.ts`**

Create `src/utils/markdown/remarkInline.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const HIGHLIGHT_REGEX = /==([^=\n]+)==/g;
const TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=$|[.,!?;:\s])/g;

export const remarkInline: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // Pass 1: Highlights (==text==)
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if (parent.type === "code" as any || parent.type === "inlineCode" as any) return;

      const value = node.value;
      if (!value.includes("==")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      HIGHLIGHT_REGEX.lastIndex = 0;

      while ((match = HIGHLIGHT_REGEX.exec(value)) !== null) {
        const start = match.index;
        if (start > lastIndex) {
          newChildren.push({ type: "text", value: value.slice(lastIndex, start) });
        }
        newChildren.push({
          type: "highlight",
          data: {
            hName: "mark",
            hProperties: { className: "markdown-highlight" },
          },
          children: [{ type: "text", value: match[1] }],
        });
        lastIndex = HIGHLIGHT_REGEX.lastIndex;
      }

      if (lastIndex < value.length) {
        newChildren.push({ type: "text", value: value.slice(lastIndex) });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });

    // Pass 2: Tag Pills (#tag)
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if (parent.type === "code" as any || parent.type === "inlineCode" as any) return;

      const value = node.value;
      if (!value.includes("#")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      TAG_REGEX.lastIndex = 0;

      while ((match = TAG_REGEX.exec(value)) !== null) {
        const fullMatch = match[0];
        const leadingWhitespace = fullMatch.startsWith(" ") ? " " : "";
        const tag = match[1];
        const start = match.index;

        if (start > lastIndex) {
          newChildren.push({ type: "text", value: value.slice(lastIndex, start) });
        }

        if (leadingWhitespace) {
          newChildren.push({ type: "text", value: " " });
        }

        newChildren.push({
          type: "tagPill",
          data: {
            tag,
            hName: "span",
            hProperties: {
              className: "markdown-tag-pill",
              "data-tag": tag,
            },
          },
          children: [{ type: "text", value: `#${tag}` }],
        });

        lastIndex = TAG_REGEX.lastIndex;
      }

      if (lastIndex < value.length) {
        newChildren.push({ type: "text", value: value.slice(lastIndex) });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/markdown/remarkInline.test.ts`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/utils/markdown/remarkInline.ts src/utils/markdown/remarkInline.test.ts
git commit -m "feat(markdown): implement remarkInline AST plugin for ==highlights== and #tags"
```

---

### Task 6: Interactive UI Components (Callouts, CodeBlocks, TaskCheckboxes)

**Files:**
- Create: `src/components/markdown/CalloutBlock.tsx`
- Create: `src/components/markdown/CodeBlockWithCopy.tsx`
- Create: `src/components/markdown/InteractiveTaskCheckbox.tsx`
- Create: `src/components/markdown/markdown.css`
- Test: `src/components/markdown/CalloutBlock.test.tsx`

**Interfaces:**
- Consumes: `lucide-react`, React 19
- Produces: Visual components with theme-adaptive styling and interactive actions.

- [ ] **Step 1: Write test for `CalloutBlock`**

Create `src/components/markdown/CalloutBlock.test.tsx`:
```tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalloutBlock } from "./CalloutBlock";

describe("CalloutBlock", () => {
  it("renders non-foldable callout", () => {
    render(
      <CalloutBlock calloutType="note" title="Note Title" isFoldable={false} defaultFolded={false}>
        <p>Callout content</p>
      </CalloutBlock>
    );
    expect(screen.getByText("Note Title")).toBeInTheDocument();
    expect(screen.getByText("Callout content")).toBeInTheDocument();
  });

  it("toggles foldable callout on header click", () => {
    render(
      <CalloutBlock calloutType="tip" title="Foldable Tip" isFoldable={true} defaultFolded={true}>
        <p>Hidden body</p>
      </CalloutBlock>
    );
    const header = screen.getByText("Foldable Tip");
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByText("Hidden body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `CalloutBlock.tsx`**

Create `src/components/markdown/CalloutBlock.tsx`:
```tsx
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

interface CalloutBlockProps {
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
```

- [ ] **Step 3: Implement `CodeBlockWithCopy.tsx`**

Create `src/components/markdown/CodeBlockWithCopy.tsx`:
```tsx
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockWithCopyProps {
  className?: string;
  children: React.ReactNode;
}

export const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1].toUpperCase() : "TEXT";

  const handleCopy = () => {
    const text = typeof children === "string" ? children : String(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
```

- [ ] **Step 4: Implement `InteractiveTaskCheckbox.tsx`**

Create `src/components/markdown/InteractiveTaskCheckbox.tsx`:
```tsx
import React from "react";

interface InteractiveTaskCheckboxProps {
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
    />
  );
};
```

- [ ] **Step 5: Create `markdown.css`**

Create `src/components/markdown/markdown.css` with tactile callout styles, tables, tags, highlights, and embed styling.

- [ ] **Step 6: Run tests to verify**

Run: `npx vitest run src/components/markdown/CalloutBlock.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/markdown/CalloutBlock.tsx src/components/markdown/CalloutBlock.test.tsx src/components/markdown/CodeBlockWithCopy.tsx src/components/markdown/InteractiveTaskCheckbox.tsx src/components/markdown/markdown.css
git commit -m "feat(markdown): create CalloutBlock, CodeBlockWithCopy, and InteractiveTaskCheckbox"
```

---

### Task 7: Note Transclusion Card & WikiLink Resolution (`TranscludedNoteCard`, `WikiLinkAnchor`)

**Files:**
- Create: `src/components/markdown/WikiLinkAnchor.tsx`
- Create: `src/components/markdown/TranscludedNoteCard.tsx`
- Test: `src/components/markdown/WikiLinkAnchor.test.tsx`

**Interfaces:**
- Consumes: `CampaignNote`, `convertFileSrc`
- Produces: `WikiLinkAnchor` with note selection & stub creation; `TranscludedNoteCard` with cycle guard via React context.

- [ ] **Step 1: Write test for `WikiLinkAnchor`**

Create `src/components/markdown/WikiLinkAnchor.test.tsx`:
```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WikiLinkAnchor } from "./WikiLinkAnchor";

describe("WikiLinkAnchor", () => {
  it("navigates to existing note on click", () => {
    const onSelectNote = vi.fn();
    render(
      <WikiLinkAnchor
        target="Waterdeep"
        alias="Waterdeep"
        targetNoteId="note-123"
        onSelectNote={onSelectNote}
        onCreateNote={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Waterdeep"));
    expect(onSelectNote).toHaveBeenCalledWith("note-123");
  });

  it("calls onCreateNote when target note does not exist", () => {
    const onCreateNote = vi.fn();
    render(
      <WikiLinkAnchor
        target="Missing Place"
        alias="Missing Place"
        targetNoteId={null}
        onSelectNote={vi.fn()}
        onCreateNote={onCreateNote}
      />
    );
    fireEvent.click(screen.getByText("Missing Place?"));
    expect(onCreateNote).toHaveBeenCalledWith("Missing Place");
  });
});
```

- [ ] **Step 2: Implement `WikiLinkAnchor.tsx`**

Create `src/components/markdown/WikiLinkAnchor.tsx`:
```tsx
import React from "react";

interface WikiLinkAnchorProps {
  target: string;
  alias: string;
  heading?: string;
  targetNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (targetTitle: string) => void;
}

export const WikiLinkAnchor: React.FC<WikiLinkAnchorProps> = ({
  target,
  alias,
  heading,
  targetNoteId,
  onSelectNote,
  onCreateNote,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (targetNoteId) {
      onSelectNote(targetNoteId);
      if (heading) {
        setTimeout(() => {
          const el = document.getElementById(heading.toLowerCase().replace(/\s+/g, "-"));
          el?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      }
    } else {
      onCreateNote(target);
    }
  };

  if (!targetNoteId) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="markdown-note-link markdown-note-link-missing"
        title="Note does not exist. Click to create."
      >
        {alias}?
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="markdown-note-link"
    >
      {alias}
    </button>
  );
};
```

- [ ] **Step 3: Implement `TranscludedNoteCard.tsx`**

Create `src/components/markdown/TranscludedNoteCard.tsx` with recursive depth guard (`maxDepth = 3`) and `embedStack: Set<string>`.

- [ ] **Step 4: Run test to verify**

Run: `npx vitest run src/components/markdown/WikiLinkAnchor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/markdown/WikiLinkAnchor.tsx src/components/markdown/WikiLinkAnchor.test.tsx src/components/markdown/TranscludedNoteCard.tsx
git commit -m "feat(markdown): implement WikiLinkAnchor and TranscludedNoteCard with cycle guard"
```

---

### Task 8: Unified MarkdownRenderer & Integration with useMarkdownRender

**Files:**
- Create: `src/components/markdown/MarkdownRenderer.tsx`
- Modify: `src/hooks/useMarkdownRender.tsx`
- Create: `src/components/markdown/MarkdownRenderer.test.tsx`

**Interfaces:**
- Consumes: AST plugins (`remarkCallouts`, `remarkWikiLinks`, `remarkEmbeds`, `remarkInline`), UI components
- Produces: Production Markdown engine wired to Loreweaver preview views and AI chats.

- [ ] **Step 1: Write integration test for `MarkdownRenderer`**

Create `src/components/markdown/MarkdownRenderer.test.tsx`:
```tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer Integration", () => {
  it("renders GFM table and Obsidian callout together", () => {
    const md = `
> [!NOTE] Alert Box
> Important content

| Col 1 | Col 2 |
| :--- | :--- |
| Val 1 | Val 2 |
    `;
    render(
      <MarkdownRenderer
        content={md}
        notes={[]}
        selectedNoteId=""
        vaultPath="/vault"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
      />
    );
    expect(screen.getByText("Alert Box")).toBeInTheDocument();
    expect(screen.getByText("Important content")).toBeInTheDocument();
    expect(screen.getByText("Val 1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `MarkdownRenderer.tsx`**

Create `src/components/markdown/MarkdownRenderer.tsx`:
- Assemble `ReactMarkdown` with `remarkGfm`, `remarkMath`, `remarkCallouts`, `remarkWikiLinks`, `remarkEmbeds`, `remarkInline`, `rehypeKatex`, and `rehypeHighlight`.
- Configure custom component overrides:
  - `div` (detect `callout` & `noteEmbed`)
  - `a` (detect `wikiLink` & external links)
  - `span` (detect `mediaEmbed` & `tagPill`)
  - `mark` (detect `highlight`)
  - `code` & `pre` -> `CodeBlockWithCopy`
  - `input[type="checkbox"]` -> `InteractiveTaskCheckbox`
  - `table`, `thead`, `tbody`, `tr`, `th`, `td`

- [ ] **Step 3: Update `useMarkdownRender.tsx`**

Integrate `MarkdownRenderer` into `useMarkdownRender.tsx`, replacing the legacy regexes and wiring task list auto-saving.

- [ ] **Step 4: Run integration test to verify**

Run: `npx vitest run src/components/markdown/MarkdownRenderer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/markdown/MarkdownRenderer.tsx src/components/markdown/MarkdownRenderer.test.tsx src/hooks/useMarkdownRender.tsx
git commit -m "feat(markdown): wire unified MarkdownRenderer into useMarkdownRender"
```

---

### Task 9: Verification Gate & Regression Check

**Files:** None (full verification run)

**Interfaces:** Full system test

- [ ] **Step 1: Run frontend linter**

Run: `npm run lint`
Expected: PASS with 0 warnings and 0 errors.

- [ ] **Step 2: Run all frontend test suites**

Run: `npm run test`
Expected: PASS (all 28 original suites + all new markdown suites pass).

- [ ] **Step 3: Run production frontend build & type check**

Run: `npm run build`
Expected: PASS (Exit code 0, 0 TypeScript errors).

- [ ] **Step 4: Run backend Rust test suite**

Run: `cargo test` in `src-tauri`
Expected: PASS (111 Rust tests pass).
