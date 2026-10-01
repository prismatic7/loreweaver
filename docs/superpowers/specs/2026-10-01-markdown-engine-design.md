# Modern Markdown Engine (GFM & Obsidian Flavoured Markdown) — Technical Specification

**Date:** 2026-10-01  
**Status:** Approved  
**Topic:** Pillar 2 — Modern Markdown Engine  
**Target:** React 19 + TypeScript Frontend (`src/`)  

---

## 1. Overview & Executive Summary

Loreweaver requires a comprehensive, desktop-grade Markdown engine that seamlessly handles GitHub-Flavored Markdown (GFM) and Obsidian-Flavored Markdown (OFM). The engine replaces legacy ad-hoc regex string replacements with an Abstract Syntax Tree (AST) pipeline built on the Unified/Remark/Rehype ecosystem.

The engine provides:
1. **Full Obsidian Callouts / Admonitions:** All 13 canonical callout types, collapsible/foldable modifiers (`+`/`-`), custom titles, Lucide icons, and theme-adaptive styling.
2. **Obsidian Wikilinks, Aliases, & Heading Anchors:** `[[Note]]`, `[[Note|Alias]]`, `[[Note#Heading]]`, and missing-note creation stubs.
3. **Note Transclusions & Media Embeds:** `![[Note]]` transclusions with recursion cycle guards, and dimensioned media embeds (`![[image.png|300x200]]`).
4. **Interactive Task Lists:** Preview-mode checkboxes (`- [ ]` / `- [x]`) that toggle note markdown and trigger automated persistence.
5. **Math / LaTeX:** Inline (`$..$`) and display (`$$..$$`) mathematics rendered with KaTeX.
6. **Code Blocks with Syntax Highlighting & Copy:** Fenced code blocks with language labels and 1-click clipboard copy.
7. **Extended Typography:** `==highlights==` and `#tag` pills.

---

## 2. Architecture & AST Pipeline

The pipeline is split into parsing, AST transformation, HTML generation, and React component mapping:

```
Raw Markdown
    │
    ▼
remark-parse (Markdown -> MDAST)
    │
    ▼
remark-gfm (Tables, Strikethrough, Footnotes, TaskLists)
    │
    ▼
remark-math (Inline $ & Display $$)
    │
    ▼
remark-obsidian-transforms (Custom AST Visitors)
    ├── remarkCallouts (Blockquote -> Callout AST Node)
    ├── remarkWikiLinks (Text -> WikiLink AST Node)
    ├── remarkEmbeds (Text -> Note Transclusion / Media AST Node)
    ├── remarkHighlights (Text -> Highlight AST Node)
    └── remarkTags (Text -> Tag AST Node)
    │
    ▼
remark-rehype (MDAST -> HAST)
    ├── rehype-katex (TeX -> HTML/MathML)
    └── rehype-highlight (Syntax highlighting)
    │
    ▼
React Component Mapping (Interactive UI in Preview & Views)
```

### Module Breakdown
- `src/utils/markdown/remarkCallouts.ts`: AST visitor converting blockquotes containing `[!TYPE][+-]` headers into `callout` nodes.
- `src/utils/markdown/remarkWikiLinks.ts`: AST visitor converting `[[...]]` links into `wikiLink` nodes while skipping code blocks.
- `src/utils/markdown/remarkEmbeds.ts`: AST visitor converting `![[...]]` into `noteEmbed` or `mediaEmbed` nodes.
- `src/utils/markdown/remarkInline.ts`: AST visitors for `==highlights==` and `#tag` patterns.
- `src/components/markdown/MarkdownRenderer.tsx`: Core component rendering the unified pipeline with custom React element replacements.
- `src/components/markdown/CalloutBlock.tsx`: Collapsible callout component.
- `src/components/markdown/TranscludedNoteCard.tsx`: Inset note transclusion card with recursion prevention.
- `src/components/markdown/CodeBlockWithCopy.tsx`: Syntax highlighted code fence with copy-to-clipboard action.
- `src/components/markdown/InteractiveTaskCheckbox.tsx`: Interactive checkbox with note persistence.

---

## 3. Syntax & Behavioral Specification

### 3.1 Obsidian Callouts
- **Syntax:** `> [!TYPE][+-] [Title]`
- **Modifiers:**
  - `+`: Collapsible, expanded by default.
  - `-`: Collapsible, collapsed by default.
  - Omitted: Non-collapsible static callout box.
- **Types & Lucide Icon Map:**
  - `note`, `seealso` -> `FileText` (Steel Blue)
  - `abstract`, `summary`, `tldr` -> `BookOpen` (Cyan)
  - `info`, `todo` -> `Info` / `ListTodo` (Blue)
  - `tip`, `hint`, `important` -> `Lightbulb` (Emerald)
  - `success`, `check`, `done` -> `CheckCircle2` (Green)
  - `question`, `help`, `faq` -> `HelpCircle` (Violet)
  - `warning`, `caution`, `attention` -> `AlertTriangle` (Amber)
  - `failure`, `fail`, `missing` -> `XCircle` (Red)
  - `danger`, `error` -> `AlertOctagon` (Crimson)
  - `bug` -> `Bug` (Rose)
  - `example` -> `Layers` (Purple)
  - `quote`, `cite` -> `Quote` (Slate)

### 3.2 Wikilinks & Anchors
- `[[Target Note]]`: Resolved against note title, alias, or file stem.
- `[[Target Note|Custom Text]]`: Displays `Custom Text`, links to target note.
- `[[Target Note#Section]]`: Links to target note and anchors to `#section`.
- `[[#Local Heading]]`: Anchors to heading within the current active note.
- Unresolved notes: Rendered with `.markdown-note-link-missing` (dashed border, `?` suffix); clicking initiates note creation.

### 3.3 Note Transclusions & Media Embeds
- `![[Target Note]]`: Renders the target note body in a framed sub-card with note title badge and jump button.
- `![[Target Note#Section]]`: Transcludes only the section under the specified heading.
- Media Embeds:
  - Images: `![[image.png]]`, `![[image.png|300]]` (width), `![[image.png|300x200]]` (dimensions).
  - Audio: `![[sound.mp3]]`, `![[audio.ogg]]` -> native audio player.
  - Video: `![[clip.mp4]]` -> native video player.
  - Paths resolved using vault root and Tauri's `convertFileSrc`.

### 3.4 Interactive Task Lists
- Format: `- [ ] Unchecked` and `- [x] Checked`.
- Clicking a checkbox in preview mode locates the task line in the note's markdown string, flips the boolean state, and invokes `saveNote`.

### 3.5 Math, Highlights, & Code
- Inline math: `$f(x) = x^2$`
- Block math: `$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$`
- Highlights: `==marked text==`
- Tags: `#tag`, `#nested/tag`
- Code blocks: Language header banner + copy button.

---

## 4. Error Handling & Edge Cases

1. **Circular Transclusions:** An `embedStack: Set<string>` tracks active embeddings. If an ID already exists in the stack, rendering terminates with `⚠️ Circular embed detected: [[Note Name]]`. Max depth is capped at 3.
2. **Code Fence Isolation:** Backtick code spans and fenced blocks are strictly parsed as text by `remark-parse`; no wikilinks, callouts, or tags are evaluated inside them.
3. **Missing Media Assets:** If a media file does not exist, a tactile missing-asset badge is rendered instead of a broken browser icon.
4. **Malformed Math:** TeX syntax errors are caught gracefully, displaying the raw formula in monospaced red text with an explanatory tooltip.
5. **Frontmatter Stripping:** Initial YAML frontmatter (`---...---`) is cleanly extracted and displayed as structured badges above the prose body, never leaking raw YAML text into the note.

---

## 5. Verification & Testing

1. **Unit Tests (`src/utils/markdown/*.test.ts`):**
   - Callout parsing: all types, folding flags, custom titles, nested callouts.
   - Wikilink & embed parsing: targets, aliases, heading anchors, dimensions.
   - Highlight and tag parsing.
2. **Component Integration Tests (`src/components/markdown/*.test.tsx`):**
   - Callout folding toggle.
   - Task list checkbox click and note update callback.
   - Transclusion rendering and circular reference detection.
   - Code block copy action and confirmation state.
3. **Verification Gates:**
   - `npm run lint` -> 0 errors, 0 warnings.
   - `npm run test` -> 100% pass across all test suites.
   - `npm run build` -> Strict TypeScript typecheck & production Vite bundle.
   - `cargo test` in `src-tauri` -> Backend stability verified.
