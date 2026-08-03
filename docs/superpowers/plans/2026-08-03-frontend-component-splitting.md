# Frontend Component Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic `src/App.tsx` file by extracting views (Dashboard, Settings, Trash, Rules, AI, Vault) into separate component files under `src/components/` to improve readability, build chunk sizes, and testability.

**Architecture:** Create modular, typed subcomponents under `src/components/` that receive state and event handler callbacks from the parent `App` component as props. Maintain overall state in `App` for now to prevent massive rewrite of state synchronization, but isolate rendering and view-specific UI logic.

**Tech Stack:** React 19, TypeScript, Lucide Icons, CodeMirror.

## Global Constraints

- No new dependencies should be introduced.
- Strict TypeScript must be maintained, avoiding the introduction of new `any` types.
- UI layout, styles, and class names must be preserved exactly.
- All existing tests in `src/App.test.tsx` and `src/components/MarkdownEditor.test.tsx` must pass after each step.

---

### Task 1: Create Shared Types File

Move shared interfaces from `src/App.tsx` to a new `src/types.ts` file to avoid circular imports and clean up definitions.

**Files:**
- Create: `src/types.ts`
- Modify: `src/App.tsx:47-63`

**Interfaces:**
- Consumes: None
- Produces: `CampaignNote`, `RuleEntry`, `SearchResult`

- [ ] **Step 1: Create `src/types.ts`**

Write the following types to `src/types.ts`:
```typescript
export interface CampaignNote {
  id: string;
  title: string;
  path: string;
  frontmatter: Record<string, string | number | string[]>;
  content: string;
}

export interface RuleEntry {
  id: string;
  path: string;
  title: string;
  category: string;
  source: string;
  content: string;
}

export interface SearchResult {
  type: "note" | "rule";
  title: string;
  snippet: string;
  score: number;
  path: string;
}
```

- [ ] **Step 2: Modify `src/App.tsx` to import types**

Remove lines 47 to 63 from `src/App.tsx` and replace them with:
```typescript
import { CampaignNote, RuleEntry, SearchResult } from "./types";
```

- [ ] **Step 3: Run frontend tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/types.ts src/App.tsx
git commit -m "refactor: extract shared types to src/types.ts"
```

---

### Task 2: Extract `SettingsView` Component

Extract the Settings configuration panel rendering and logic from `src/App.tsx`.

**Files:**
- Create: `src/components/SettingsView.tsx`
- Modify: `src/App.tsx:4560-4995`

**Interfaces:**
- Consumes: `SettingsForm` type and React-Hook-Form bindings from `App`
- Produces: `SettingsView` React Component

- [ ] **Step 1: Create `src/components/SettingsView.tsx`**

Write the component structure to `src/components/SettingsView.tsx`:
```typescript
import React from "react";
import { UseFormRegister, UseFormHandleSubmit, FieldErrors } from "react-hook-form";

interface SettingsViewProps {
  register: UseFormRegister<any>;
  handleSubmit: UseFormHandleSubmit<any>;
  onSubmit: (data: any) => void;
  errors: FieldErrors<any>;
  isDirty: boolean;
  isValid: boolean;
  isTestingConnection: boolean;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  testSettingsConnection: (provider: string) => void;
  watch: any;
  setValue: any;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  register,
  handleSubmit,
  onSubmit,
  errors,
  isDirty,
  isValid,
  isTestingConnection,
  theme,
  setTheme,
  testSettingsConnection,
  watch,
  setValue,
}) => {
  const llmProvider = watch("llm_provider");
  const embedProvider = watch("embed_provider");
  const imageProvider = watch("image_provider");
  const ttsProvider = watch("tts_provider");
  const sttProvider = watch("stt_provider");

  return (
    <form
      className="view-container"
      data-od-id="settings-view"
      onSubmit={handleSubmit(onSubmit)}
      style={{ padding: "40px 32px", overflowY: "auto" }}
    >
      {/* settings UI structure exactly as copied from App.tsx settings view */}
    </form>
  );
};
```

- [ ] **Step 2: Replace settings view rendering block in `src/App.tsx`**

Import and render `<SettingsView ... />` inside the settings tab branch of `src/App.tsx`.

- [ ] **Step 3: Run frontend tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/components/SettingsView.tsx src/App.tsx
git commit -m "refactor: extract SettingsView component"
```

---

### Task 3: Extract `TrashView` Component

Extract the Trashed Notes and Folders panel from `src/App.tsx`.

**Files:**
- Create: `src/components/TrashView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CampaignNote` type, list of trashed notes, and deletion/restoration handler functions.
- Produces: `TrashView` React Component

- [ ] **Step 1: Create `src/components/TrashView.tsx`**

Write the component structure to `src/components/TrashView.tsx`:
```typescript
import React from "react";
import { CampaignNote } from "../types";
import { Trash2, RotateCcw } from "lucide-react";

interface TrashViewProps {
  trashedNotes: CampaignNote[];
  handleEmptyTrash: () => void;
  handleRestoreNote: (path: string) => void;
  handleDeleteTrashedNote: (path: string) => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  trashedNotes,
  handleEmptyTrash,
  handleRestoreNote,
  handleDeleteTrashedNote,
}) => {
  return (
    <div
      className="view-container"
      data-od-id="trash-view"
      style={{ padding: "40px 32px", overflowY: "auto" }}
    >
      {/* UI structure exactly as copied from App.tsx trash view */}
    </div>
  );
};
```

- [ ] **Step 2: Replace trash rendering block in `src/App.tsx`**

Import and render `<TrashView ... />` inside the trash tab branch of `src/App.tsx`.

- [ ] **Step 3: Run frontend tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/components/TrashView.tsx src/App.tsx
git commit -m "refactor: extract TrashView component"
```

---

### Task 4: Extract `DashboardView` Component

Extract the Main Dashboard interface from `src/App.tsx`.

**Files:**
- Create: `src/components/DashboardView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: lists of notes, stats counters, folder paths, and action handlers.
- Produces: `DashboardView` React Component

- [ ] **Step 1: Create `src/components/DashboardView.tsx`**

Write the component structure to `src/components/DashboardView.tsx`. Include stats lists, quick-start shortcuts, and dice roller panel components exactly matching the rendering structure.

- [ ] **Step 2: Replace dashboard rendering block in `src/App.tsx`**

Import and render `<DashboardView ... />` inside the dashboard tab branch of `src/App.tsx`.

- [ ] **Step 3: Run frontend tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/components/DashboardView.tsx src/App.tsx
git commit -m "refactor: extract DashboardView component"
```

---

### Task 5: Extract `RulesView` & `AiView` Components

Extract the remaining auxiliary tab views to independent component sheets.

**Files:**
- Create: `src/components/RulesView.tsx`
- Create: `src/components/AiView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: category selections, import rules callback, chatbot history messages, LLM response dispatch handlers.
- Produces: `RulesView` and `AiView` React Components

- [ ] **Step 1: Create `src/components/RulesView.tsx` and `src/components/AiView.tsx`**

Implement sub-component layouts matching the original rendering segments exactly.

- [ ] **Step 2: Replace corresponding view tabs in `src/App.tsx`**

Import and replace with `<RulesView ... />` and `<AiView ... />` inline.

- [ ] **Step 3: Run compilation and test checks**

Run: `npm run build && npm run test`
Expected: SUCCESS

- [ ] **Step 4: Commit changes**

```bash
git add src/components/RulesView.tsx src/components/AiView.tsx src/App.tsx
git commit -m "refactor: extract RulesView and AiView components"
```
