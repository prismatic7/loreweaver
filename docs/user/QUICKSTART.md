# User Quickstart Guide

This guide will walk you through launching Loreweaver for the first time, setting up your campaign vault, and utilizing the local AI-assisted search and writing utilities.

---

## 1. Installation and Setup

### Prerequisites
Make sure your system has the standard OS prerequisites installed for Tauri v2 desktop apps.
- **macOS:** Xcode Command Line Tools.
- **Windows:** Microsoft C++ Build Tools & WebView2.
- **Linux:** `webkit2gtk`, `glib`, `libsoup` libraries.

Refer to the [Tauri Prerequisites Guide](https://tauri.app/start/prerequisites/) for detailed commands.

### Build and Launch
Clone the workspace and run the following in your shell:
1. Install Node modules:
   ```bash
   npm install
   ```
2. Start the Tauri development loop:
   ```bash
   npm run tauri dev
   ```

---

## 2. Setting Up Your First Vault

When Loreweaver launches, you will see the **Campaign Workspace Dashboard**. To start writing:
1. Click the **Settings Gear icon** at the bottom-left of the navigation ribbon.
2. Under **Campaign Vault Settings**, click **Manage Vaults**.
3. Choose an existing folder on your computer or create a new empty directory (e.g. `MyCampaignVault`). This folder is now your local-first **Campaign Vault**.
4. All notes you write in Loreweaver will be saved directly to this directory as raw, standard `.md` Markdown files.

---

## 3. Creating and Linking Notes

Navigate to the **Campaign Vault Explorer** (Folder icon in the ribbon):
1. Click **+ New Note** in the sidebar.
2. Choose a title (e.g., `Eldoria`) and hit **Enter**.
3. Toggle to **Edit mode** (pencil icon at the top right of the note sheet).
4. Add properties in the **Metadata Properties** dropdown (like `type: City` or `tags: [faction/elves, status/active]`).
5. Write your note content using Markdown.
6. Create links to other notes using standard **wikilinks** syntax: `[[Lord Malakor]]`. Autocomplete suggestions will pop up as you type.

---

## 4. Using semantic and keyword search

Loreweaver indexers run automatically in the background:
1. Press the **Search Bar** (or key combo `Cmd+P` / `Ctrl+P`).
2. Type a concept (e.g., `ancient elven kingdoms`).
3. The hybrid query engine runs keyword matching (FTS5) and local vector similarity (ONNX MiniLM-L6) to find relevant paragraphs.
4. Click any search result to open that note immediately.

---

## 5. Consulting the Campaign Architect

To get AI assistance using your local notes:
1. Click the **Settings Gear icon** to configure your AI provider (e.g. Ollama, OpenAI, Gemini).
2. Click the **Campaign Architect icon** (brain icon in the ribbon).
3. Type a creative query (e.g., `Suggest 3 plot hooks for the party visiting Eldoria`).
4. The Architect will fetch matching notes via hybrid RAG, compile them as background context, and generate creative ideas in clean markdown.
