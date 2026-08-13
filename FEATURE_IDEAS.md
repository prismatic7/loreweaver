# Loreweaver: Feature Ideas and Polish Report

This report presents a prioritised registry of new feature ideas and user interface (UI) / user experience (UX) polish opportunities for **Loreweaver**. Grounded in the design commitments of "The Tactile Ledger" and the current constraints of the Rust/TypeScript codebase, these proposals aim to reduce friction for Game Masters (GMs) during campaign preparation and live session running.

All proposals are written in professional international English with Australian spelling conventions.

---

## Executive Summary & Current Gaps

Loreweaver is built on strong architectural foundations: local-first security, SQLite hybrid search, and a manifest-driven World Object framework. However, several critical gaps and incomplete placeholders remain in the codebase:

1. **Speech-to-Text (STT) is Unimplemented Locally**: The speech provider contains only a placeholder error path for local STT (`src-tauri/src/providers/speech.rs#L173`), preventing completely offline dictation.
2. **Image Generation is a Frontend Mock**: While the Rust backend implements ComfyUI and local Stable Diffusion API bindings, the frontend UI simply acts as a timed display placeholder with limited settings.
3. **Transient Plugin State**: Plugin execution state (`globalThis.__state`) is stored in-memory in a process-wide `OnceLock` mutex (`src-tauri/src/plugins.rs#L61`). Consequently, custom campaign trackers (e.g. Doom Clocks) do not survive application restarts.
4. **Fragile Note Saving**: Saving is tied exclusively to the manual "Preview" toggle button (`src/components/CampaignVaultView.tsx#L605`). Navigating away in the sidebar or changing views results in silent data loss.

---

## Section A: New Feature Ideas

These features introduce new capabilities to the Loreweaver core, building directly on existing files and design sketches.

### 1. Offline Local Speech-to-Text (STT) Integration
* **Priority**: P1 (Strategic / Quick Win)
* **Grounded Path**: [`src-tauri/src/providers/speech.rs#L173-L175`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/providers/speech.rs#L173-L175)
* **Why it matters for GMs**: During intense live play, typing disrupts the flow. GMs need hands-free dictation to log player actions or record session summaries without sending sensitive voice data to external cloud providers.
* **Implementation Summary**: 
  Replace the `"local"` error arm with an integration of a lightweight offline STT engine (such as `Vosk` or a local `Whisper.cpp` wrapper) using models (~100MB) stored in the local application data directory.

---

### 2. SQLite-Backed Persistent Plugin State
* **Priority**: P1 (Strategic)
* **Grounded Path**: [`src-tauri/src/plugins.rs#L60-L71`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/plugins.rs#L60-L71)
* **Why it matters for GMs**: Third-party plugins (like custom calendar clocks, character stat checkers, or campaign trackers) lose all state upon closing Loreweaver, forcing GMs to re-enter values every session.
* **Implementation Summary**: 
  Create a new `plugin_states` table in SQLite (`db.rs`) containing `vault_path`, `plugin_id`, and a `state_json` string. Modify `plugins.rs` to deserialise this JSON string into the Boa execution context at session start and serialise it back to the database after each hook execution.

---

### 3. Live Microphone Dictation UI Panel
* **Priority**: P2 (Quick Win)
* **Grounded Path**: [`src/components/RightDrawer.tsx#L1473-L1488`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/RightDrawer.tsx#L1473-L1488)
* **Why it matters for GMs**: The current STT implementation relies on file uploads, requiring GMs to record audio externally first. A live record button streamlines capture.
* **Implementation Summary**: 
  Integrate the browser `MediaRecorder` API directly in the right drawer panel. Stream recorded audio chunks to a base64 buffer, enabling one-touch dictation straight into the capture inbox or current scratchpad.

---

### 4. Customisable Bible Files in World Manifests
* **Priority**: P2 (Strategic)
* **Grounded Path**: [`src-tauri/src/agent.rs#L111-L121`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/agent.rs#L111-L121) and [`src-tauri/src/worlds.rs`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/worlds.rs)
* **Why it matters for GMs**: Different game systems require different world bibles (e.g. a fantasy game needs `MAGIC_SYSTEM.md` or `PANTHEON.md` instead of the hardcoded `CONSPIRACY.md`).
* **Implementation Summary**: 
  Extend `world.json` (`world_manifest` in `types.ts`) to accept an array of bible filenames (`bible_files`). Update `load_bible_context` in `agent.rs` to read from this custom list, falling back to the default 8 campaign files when not specified.

---

### 5. Dynamic Force-Directed Entity Graph
* **Priority**: P2 (Strategic)
* **Grounded Path**: [`src/components/EntityGraphView.tsx`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/EntityGraphView.tsx)
* **Why it matters for GMs**: The relationship web of a long campaign grows complex. Static layout rendering makes it difficult to trace connections during play.
* **Implementation Summary**: 
  Refactor the canvas element inside `EntityGraphView` to use a dynamic force-directed layout (e.g. using D3 or React Flow). Allow GMs to drag nodes, pin key entities (like primary antagonists), and highlight relational threads dynamically.

---

### 6. Local LLM Model Downloader & Manager UI
* **Priority**: P3 (Moonshot)
* **Grounded Path**: [`src/components/SettingsView.tsx#L687-L708`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/SettingsView.tsx#L687-L708) and [`src-tauri/src/providers/llm.rs`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/providers/llm.rs)
* **Why it matters for GMs**: Finding and installing local models (e.g. using Ollama) requires command-line familiarity. In-app management reduces this barrier to entry.
* **Implementation Summary**: 
  Add a dedicated model downloader component to the settings view. Query local provider libraries (like Ollama's local tag API `/api/tags`) and provide a one-click button to download/pull recommended models directly from the UI.

---

## Section B: Polish & UX Improvements

These items address visual layout alignment, accessibility, and critical safety guardrails for the interface.

### 1. Debounced Autosave and Navigation Guard
* **Priority**: P1 (Quick Win / Safety)
* **Grounded Path**: [`src/hooks/useNotes.ts#L100-L122`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/hooks/useNotes.ts#L100-L122) and [`src/components/CampaignVaultView.tsx#L603-L608`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/CampaignVaultView.tsx#L603-L608)
* **Why it matters for GMs**: If a GM is modifying a location note during a live session, switching to a different note in the folder tree or opening the settings panel will silently discard all unsaved edits.
* **Execution Summary**: 
  Add a `useEffect` hook in `useNotes` that listens to changes in the editor text and triggers a debounced call to `immediateSave` (e.g. 1500ms after the user stops typing). Furthermore, implement an `onBlur` trigger and a navigation guard to warn the user if unsaved changes are pending before the view switches.

---

### 2. Base URL Override for TTS & STT Providers
* **Priority**: P1 (Quick Win)
* **Grounded Path**: [`src/components/SettingsView.tsx#L727`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/SettingsView.tsx#L727) and [`src-tauri/src/providers/speech.rs#L29-L33`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/providers/speech.rs#L29-L33)
* **Why it matters for GMs**: GMs running offline setups often route speech APIs to local endpoints (such as local Whisper servers or local ElevenLabs proxies).
* **Execution Summary**: 
  Remove the `activeConfigTab !== "stt" && activeConfigTab !== "tts"` layout condition in `SettingsView.tsx` that hides the "Base URL Override" field. In the backend `speech.rs`, parse and respect the custom `base_url` argument for speech generation and transcription instead of relying on hardcoded defaults.

---

### 3. Change Detection Warning for MapBuilder and FolderCanvas
* **Priority**: P1 (Quick Win)
* **Grounded Path**: [`src/components/MapBuilderView.tsx#L202-L210`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/MapBuilderView.tsx#L202-L210)
* **Why it matters for GMs**: Much like the markdown editor, maps require manual clicking of "Save Map". Accidental navigation results in lost vector drawings, fog-of-war adjustments, and token positions.
* **Execution Summary**: 
  Compare current canvas/token state with loaded files on unmount or tab switch. Show a custom Tauri confirmation modal warning the GM of unsaved maps changes before permitting navigation.

---

### 4. Interactive NPC Voice Selector in AI Panel
* **Priority**: P2 (Quick Win)
* **Grounded Path**: [`src/components/RightDrawer.tsx#L1106`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/RightDrawer.tsx#L1106) and [`src-tauri/src/worlds.rs#L59-L62`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/worlds.rs#L59-L62)
* **Why it matters for GMs**: Currently, GMs must manually type in the voice ID/name inside the text field when asking the AI to speak. This is error-prone and slows down game narration.
* **Execution Summary**: 
  Replace the text input field with a dropdown selector populating values directly from the active world manifest's `voices` bank. Allow GMs to quickly select an NPC (e.g. "Titus Crow") and have the correct voice automatically assigned.

---

### 5. Transparency Inspector for RAG context
* **Priority**: P2 (UX Polish)
* **Grounded Path**: [`src/components/AiView.tsx#L94`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/AiView.tsx#L94) and [`src-tauri/src/agent.rs#L80-L90`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src-tauri/src/agent.rs#L80-L90)
* **Why it matters for GMs**: When the Campaign Architect makes a mistake or references outdated lore, GMs need to know *what* notes were loaded in the prompt context to debug their world organization.
* **Execution Summary**: 
  Add a collapsible drawer or tooltip in `AiView` showing the files retrieved by the semantic similarity pass (with their vector distance scores) and whether the World Bible was injected.

---

### 6. Accessibility Theme Overrides (Colour Blindness Modes)
* **Priority**: P3 (UX Polish)
* **Grounded Path**: [`src/components/FolderCanvas.tsx`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/FolderCanvas.tsx) and [`src/components/EntityGraphView.tsx`](file:///Users/chris/Development/loreweaver-feature-ideas-polish/src/components/EntityGraphView.tsx)
* **Why it matters for GMs**: Canvas elements, node markers, and relationship threads rely heavily on colour coding. GMs with deuteranopia or protanopia may struggle to differentiate between note types or relationship types at a glance.
* **Execution Summary**: 
  Add preset colour blindness themes to settings, applying high-contrast borders and unique geometric shapes (e.g. dashed lines, double borders) to canvas objects, mapping nodes, and links to ensure readability without relying solely on hue.
