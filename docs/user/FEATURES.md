# Loreweaver Features Guide

This document describes all primary features of the Loreweaver application, their details, and how to utilize them during your tabletop sessions.

---

## 1. Markdown Campaign Vault & Wikilinks

The Campaign Vault acts as your primary repository for lore, locations, and characters.

- **Wikilinks:** Connecting notes is as simple as typing `[[Note Name]]`. A CodeMirror autocompletion popover suggests candidates based on note titles and declared aliases.
- **YAML Frontmatter:** Note headers contain a metadata drawer (e.g. `type: Character`, `tags: [npc/friendly]`). These properties are parsed by the Rust core and indexable.
- **Auto-Save:** All modifications made in the editor automatically commit back to disk and database within 250ms of typing inactivity.

---

## 2. Interactive Board Canvas

Visual maps and flowcharts are managed using Canvas Boards.

- **Interactive Boards:** Create a `.canvas` file to visualize relationships (e.g. faction connections, dungeon mapping).
- **Frontend Nodes:** Visual nodes are rendered via SVG. Double-click a node to edit labels, colors, or associate them with existing Markdown notes.
- **Storage:** Canvas layouts are saved locally alongside notes in standard JSON formatting.

---

## 3. Rulebook & SRD Ingestion

Loreweaver allows GMs to import System Reference Documents (SRDs) to keep rules handy.

- **SRD Import:** Import plaintext Markdown SRD documents from the **Rulebook view**.
- **Header Splitting:** The ingestion engine splits the document by H1 (`#`), H2 (`##`), and H3 (`###`) header tags.
- **Rule Entries:** Each section is saved as a separate rule entry categorized under a specific Category and Source (e.g. `Category: Magic`, `Source: D&D 5e SRD`).
- **Offline Browser:** Browse rules in the rules sidebar side-by-side with your campaign vault.

---

## 4. Local Hybrid Search

The search interface blends semantic vector similarity with classic keyword lookup.

- **Keyword Index (FTS5):** Performs fast string and prefix matching across note titles and content.
- **Vector Search (ONNX):** Generates 384-dimensional dense vectors using a local `all-MiniLM-L6-v2` ONNX model.
- **Blended Ranking:** Results are ranked using a weighted score: 70% vector distance similarity + 30% keyword match BM25 score.

---

## 5. AI Campaign Architect Chat

The Architect acts as an AI assistant that understands your campaign.

- **Retrieval-Augmented Generation (RAG):** When you query the Architect, it runs a local hybrid search, pulls the top 4 matching snippets and your currently open note, and injects them as system context to the LLM.
- **Supported Providers:** Ollama (local), OpenAI (cloud), Google Gemini (cloud), and Anthropic (cloud).
- **Markdown Outputs:** Responses are returned in clean, readable markdown format.

---

## 6. JS Plugin Extensibility

Extend Loreweaver's functionalities using community-developed scripts.

- **System Hooks:** Plugins register JS hook handlers (like `on_dice_roll` or `on_note_change`) to modify behaviors.
- **State Persistence:** The host engine (`boa_engine`) maintains a persistent state object `__state` per plugin, allowing settings or counts to survive between script runs.
- **Permissions:** Whitelisted to the `"hooks"` permission model.

---

## 7. Trash, Restore, and Empty Folders

- **Send to Trash:** Right-click a note or folder and choose **Send to Trash** to move it to the vault's `.trash/` directory. The action can be undone.
- **Restore:** Open the **Trash** view from the sidebar, then click **Restore** to return a note to its original folder.
- **Empty Trash:** Permanently delete everything in `.trash/` with the **Empty Trash** button.
- **Persistent Empty Folders:** Deleting the last note in a folder leaves the empty folder visible in the explorer; folders are removed only when you explicitly delete them.

---

## 8. Image Generation Mockup

- **Demonstration:** The **Architect Art Gallery** is a demonstration interface. Clicking generate starts a 3-second timer and displays cached assets.
- **Backend Infrastructure:** Stable Diffusion API client bindings exist in the Rust backend crate but are currently not connected to the UI.
