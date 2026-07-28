# Loreweaver Settings Reference

This document provides a reference for configuring application directories, database paths, and AI model parameters in Loreweaver.

---

## 1. Application Directories

Loreweaver stores local indexes, embedding models, and third-party plugins in your system's standard Application Support folder:
- **macOS:** `/Users/<username>/Library/Application Support/com.chronicle.loreweaver/`
- **Windows:** `C:\Users\<username>\AppData\Roaming\com.chronicle.loreweaver\`
- **Linux:** `/home/<username>/.local/share/com.chronicle.loreweaver/`

### Primary Contents:
* `loreweaver.db`: SQLite database containing notes index, rulebooks, and settings.
* `models/all-MiniLM-L6-v2/`: Local ONNX model and tokenizer files.
* `plugins/`: Active Javascript plugins folder.

---

## 2. Campaign Vault Management
The active campaign folder is configured in the **Manage Vaults** settings drawer.
- **Vault Location:** Any directory on your hard drive can serve as a vault.
- **Vault Switching:** Selecting a new vault updates the app path context, restarts the directory watcher thread, and re-indexes SQLite. Note directories do not bleed between vaults.

---

## 3. AI Provider Credentials

AI settings are managed under their respective provider tabs:

### Ollama (Local)
- **API Endpoint:** Default `http://localhost:11434`.
- **Model Name:** The model identifier pulled in Ollama (e.g. `llama3`, `mistral`, `phi3`).

### OpenAI / OpenAI-Compatible (Cloud/Local)
- **API Key:** Your developer API key (or dummy key for local API gateways).
- **Base URL:** Default `https://api.openai.com`. You can redirect this to local gateways like LocalAI, LM Studio, or vLLM.
- **Model Name:** Default `gpt-4o`.

### Google Gemini (Cloud)
- **API Key:** Gemini API key.
- **Base URL:** Default `https://generativelanguage.googleapis.com`.
- **Model Name:** Default `gemini-1.5-flash` or `gemini-1.5-pro`.

### Anthropic (Cloud)
- **API Key:** Anthropic API key.
- **Base URL:** Default `https://api.anthropic.com`.
- **Model Name:** Default `claude-3-5-sonnet-20240620`.

---

## 4. Vector Embedding Configuration

Loreweaver uses a hybrid search strategy that relies on 384-dimensional vector embeddings.

### Local Embeddings (Default)
Runs local CPU/GPU inference using ONNX Runtime. The first search initializes a download of the `all-MiniLM-L6-v2` transformer package (~100MB). No api keys are required.

### Remote Embeddings
You can route embeddings to remote APIs under the settings tab:
- **OpenAI:** Uses `text-embedding-3-small` (configured to output 384 dimensions).
- **Gemini:** Uses `text-embedding-004` (384 dimensions).

> [!WARNING]
> **Reindexing Requirement:** Changing your embedding provider (e.g., from local to OpenAI) requires a full database reindex. Existing vector logs are not automatically converted.

---

## 5. Connection Diagnostics
Click the **Test Connection** button next to your configured provider to run a test prompt. The diagnostic console will report HTTP statuses, API key validity, or local endpoint timeouts.
