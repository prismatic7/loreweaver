# Increment C — Vault & Organisation: Tag Hierarchy + Backlink Preview + Dynamic Outliner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Increment C from `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (Phase 3, lines 163-165): **tag hierarchies** (`#campaign/arc1/act3` from note frontmatter), **backlink preview tooltip**, and a **dynamic outliner** (heading parse → collapsible tree). The Backlinks tab already exists (`src/components/RightDrawer.tsx`); nothing else on this list exists yet.

**Architecture:** Tauri v2 monorepo — React 19 + TypeScript frontend (`src/`), Rust backend (`src-tauri/`). This increment is **frontend-only**: tag data already lives in `CampaignNote.frontmatter.tags` (loaded by the watcher/ingest pipeline into the in-memory `notes` array), and the note content is already in `CampaignNote.content` — no backend reads, no vault writes, no new Tauri commands. Pure functions in `src/utils/` do the parsing; small presentational components consume them.

**Gate:** *Nested tags render as a hierarchy and hovering a backlink shows a preview* — covered by vitest: `buildTagTree` turns `["campaign/arc1/act3"]` into a nested tree, and `NotePreviewTooltip` reveals a content snippet on hover.

## Global Constraints

- **NO vault note writes — READ-ONLY.** Tag parsing consumes `frontmatter.tags` exactly as it exists; nothing writes `vault/tags.json` or any note file. (The roadmap's `vault/tags.json` store is deferred — see Deferred.)
- **No new Tauri commands.** The roadmap lists a `get_outline` command; we ship the outliner as a pure client-side component instead. Avoids the API.md/verify-docs surface and matches the read-only constraint. `verify-docs` still runs (no new commands → no new API.md rows needed).
- **Every new frontend module has a vitest test** — coverage thresholds are 46/45/38/38 (`vite.config.ts`) and MUST hold; new code is small and fully tested, so coverage should rise slightly.
- **Backlink preview lives in the Backlinks tab** (RightDrawer), not on hover inside the markdown body. The shared markdown renderer (`useMarkdownRender`) is used by AiView, RightDrawer, and CampaignVaultView — threading hover state through it is high-risk churn; the Backlinks tab is the app's existing backlink surface and already receives the full note objects.
- **Outline is a collapsible tree, not a scroll-jumper.** Jumping to headings would require heading ids/anchor plumbing in the markdown renderer (rehype-slug etc.) — out of scope. Expand/collapse is the "dynamic outliner" behaviour shipped here.
- Do not modify plugin permissions, command signatures, or vault-write paths. All gates green before commit.

---

## Task 1: Pure tag parsing (`src/utils/tags.ts` + test)

**Files:**
- New: `src/utils/tags.ts`
- New: `src/utils/tags.test.ts`

- [x] **Step 1: `parseNoteTags(note: Pick<CampaignNote, "frontmatter">): string[]`** — read `frontmatter.tags`; accept array (map, trim, drop empties) or string (split on `,`/`;`, trim, drop empties); strip a leading `#` from each tag; return normalized list.
- [x] **Step 2: `TagNode` + `buildTagTree(notes: CampaignNote[]): TagNode[]`** — split each tag on `/` into segments; build a nested tree `{ name, path, noteIds, children }` where `noteIds` holds the notes that carry exactly that full tag path; preserve insertion order, dedupe segments.
- [x] **Step 3: tests** — `parseNoteTags` handles array / string / `#`-prefixed / empty / missing tags; `buildTagTree` nests `campaign/arc1/act3` three deep, dedupes, and attaches the right note ids; no tags → empty tree.

## Task 2: Pure outline parsing (`src/utils/outline.ts` + test)

**Files:**
- New: `src/utils/outline.ts`
- New: `src/utils/outline.test.ts`

- [x] **Step 1: `OutlineNode { level, text, children }` + `parseOutline(markdown: string): OutlineNode[]`** — scan lines; match `/^(#{1,6})\s+(.+)$/`; **skip lines inside fenced code blocks** (``` toggles); build a tree where a heading's children are the deeper headings that follow it (standard outline nesting by level).
- [x] **Step 2: tests** — h2/h3 nesting; h1 → h3 skip (h3 nests under h1); headings inside code fences ignored; plain text → `[]`.

## Task 3: TagTree component (`src/components/TagTree.tsx` + test)

**Files:**
- New: `src/components/TagTree.tsx`
- New: `src/components/TagTree.test.tsx`

- [x] **Step 1: `TagTree({ notes, setSelectedNoteId })`** — `buildTagTree(notes)` → collapsible tree; a node with children toggles expand/collapse (chevron); a node with `noteIds` lists its notes as clickable rows (call `setSelectedNoteId`); empty tree → "No tags in this vault." message. Style with existing CSS vars (`--border`, `--muted`, `--accent`), `data-od-id` attrs.
- [x] **Step 2: tests** — renders nested tags with note leaves; clicking a note leaf calls `setSelectedNoteId`; expanding/collapsing a branch; empty state.

## Task 4: NotePreviewTooltip component (`src/components/NotePreviewTooltip.tsx` + test)

**Files:**
- New: `src/components/NotePreviewTooltip.tsx`
- New: `src/components/NotePreviewTooltip.test.tsx`

- [x] **Step 1: `NotePreviewTooltip({ note, children })`** — wraps children in a hover container; on mouse enter shows an **inline preview block** (below the trigger, inside the drawer flow — avoids absolute-position clipping in the 320px scroll container) with the note title + first ~160 chars of content (whitespace-collapsed); mouse leave hides it. Renders nothing extra when not hovered.
- [x] **Step 2: tests** — mouseEnter reveals title + snippet; mouseLeave hides; long content truncated to the snippet cap.

## Task 5: NoteOutline component (`src/components/NoteOutline.tsx` + test)

**Files:**
- New: `src/components/NoteOutline.tsx`
- New: `src/components/NoteOutline.test.tsx`

- [x] **Step 1: `NoteOutline({ content })`** — `parseOutline(content)`; renders "Outline" header + collapsible tree (branch toggle); no headings → `null`. Compact, right-side panel styling.
- [x] **Step 2: tests** — renders heading tree; branch expand/collapse; plain content renders nothing.

## Task 6: Wire into the UI

**Files:**
- Modify: `src/components/RightDrawer.tsx`
- Modify: `src/components/CampaignVaultView.tsx`
- Modify: `src/App.tsx` (only if a prop is added — prefer avoiding it)

- [x] **Step 1: RightDrawer** — add `"tags"` to `RightDrawerTab`; change `notes` prop type to `CampaignNote[]` (App already passes `CampaignNote[]`; existing uses only touch `id`/`title`/`content`); add TabButton `Tags` in TabBar + `{props.tab === "tags" && <TagsTab {...props} />}` + collapsed-rail button; add `TagsTab` (header "Tag Hierarchy" + `<TagTree notes={notes} setSelectedNoteId={setSelectedNoteId} />`); wrap each backlink button in `<NotePreviewTooltip note={note}>`.
- [x] **Step 2: RightDrawer.test.tsx** — extend `makeProps` notes type usage; add cases: Tags tab renders the tree; backlink hover shows the preview. (Existing 188-line suite must keep passing.)
- [x] **Step 3: CampaignVaultView** — in read-mode (the `else` branch at ~line 1190), render `<NoteOutline content={currentNote.content} />` beside `doc-body` inside a flex row; no new props.
- [x] **Step 4: `npm run build`** — strict tsc + vite clean.

## Task 7: Docs

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (Phase 4 — mark the four frontend items done with evidence; note the deviations: no `vault/tags.json` store, no `get_outline` command, preview in Backlinks tab)
- Modify: `docs/user/FEATURES.md` (Tags tab, backlink hover preview, note outline)
- Modify: `docs/codebase/TESTING.md` (suite/test counts to the new measured numbers)
- Modify: `docs/codebase/ARCHITECTURE.md` (frontend bullets: `src/utils/tags.ts` + `src/utils/outline.ts`, TagTree/NoteOutline/NotePreviewTooltip components) — only if a natural spot exists; keep it accurate.

- [x] **Step 1: IMPLEMENTATION_PLAN.md** — mark Phase 4 items done.
- [x] **Step 2: FEATURES.md** — short bullets for the three features.
- [x] **Step 3: TESTING.md** — update suite/test counts after the run.
- [x] **Step 4: ARCHITECTURE.md** — light touch, if a natural spot exists.
- [x] **Step 5: `npm run verify-docs`** — passes (no new commands; no broken links).

## Task 8: Full gate set + commit

- [x] **Step 1: Frontend gates** — from repo root: `npm run lint`, `npm run build`, `npm run test` (19 suites / 104 + new), `npm run coverage` (thresholds 46/45/38/38 hold), `npm run verify-docs`. (Hermes cron may set `NODE_ENV=production` — prefix `NODE_ENV=test` for vitest if it misbehaves.)
- [x] **Step 2: Rust gate** — from `src-tauri/`: `cargo test --locked -- --skip test_api_key_round_trip` (no Rust changes this increment — must still pass green).
- [x] **Step 3: Commit** — plan doc + code + docs on main, descriptive message, no push. Mark checkboxes `- [ ]` → `- [x]`.

## Deferred (future work)

- **`vault/tags.json` tag store** — the roadmap's Phase 4 store; deferred because writing vault files overnight is red-lined and the in-memory parse covers the gate. Revisit as an interactive increment if hand-authored tags become a need.
- **`get_outline` Tauri command** — the roadmap's backend outline; the client-side `parseOutline` covers the gate with zero IPC.
- **Backlink preview inside the markdown body** (`NoteView` hover of `[[link]]`) — needs heading/anchor + hover plumbing in the shared `useMarkdownRender`; defer.
- **Scroll-jump from outline to heading** — requires heading ids in the markdown renderer; defer.
- **Tag filtering/search** — clicking a tag to filter the vault is a natural follow-up; not in the gate.

## Phase gate

- [x] `buildTagTree` nests `campaign/arc1/act3` three deep (vitest)
- [x] `NotePreviewTooltip` reveals a snippet on hover (vitest)
- [x] `parseOutline` produces a nested tree; fences ignored (vitest)
- [x] Tags tab renders in RightDrawer; outline renders in read-mode note view
- [x] Coverage thresholds 46/45/38/38 hold
- [x] No new Tauri commands; no vault note writes; no permission changes

## Quality Checklist

- [x] `npm run lint` clean
- [x] `npm run build` clean
- [x] `npm run test` → 104 + new passed
- [x] `npm run coverage` → thresholds hold
- [x] `npm run verify-docs` passes
- [x] `cargo test --locked -- --skip test_api_key_round_trip` from `src-tauri/` green
- [x] No new commands; no vault writes; no permission changes

## Anti-patterns

- ❌ **Writing `vault/tags.json` or any note file** — red-lined; parsing is read-only.
- ❌ **New Tauri command for the outline** — client-side parse is smaller and safer.
- ❌ **Hover tooltip inside the shared markdown renderer** — high-risk churn across AiView/RightDrawer/VaultView.
- ❌ **New frontend component without a test** — coverage gate fails.
- ❌ **Threading new props through App.tsx** — RightDrawer already receives `notes`; CampaignVaultView already has `currentNote`.

## Integration

- `loreweaver-dev-workflow` (the file-to-file recipe; this increment is the frontend-heavy slice of it)
- `loreweaver-phase-review-gate` — run the gate on the completed increment
- `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (parent plan; Increment C is the third sequenced move)
- `docs/IMPLEMENTATION_PLAN.md` (Phase 4 — tag hierarchies, backlink preview, dynamic outliner, UI tree component)
- `docs/codebase/TESTING.md` (suite/test counts)
