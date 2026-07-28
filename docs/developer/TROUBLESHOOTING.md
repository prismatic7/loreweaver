# Developer Troubleshooting Guide

This document details common runtime issues, database locks, model loading bugs, and plugin crashes encountered during Loreweaver development and deployment.

---

## 1. SQLite Database Locks (`database is locked`)

### Cause:
Tauri processes or parallel test suites attempting concurrent write transactions. Loreweaver activates **WAL (Write-Ahead Logging)** mode and sets a 5000ms busy timeout in [db.rs](file:///Users/chris/Development/loreweaver/src-tauri/src/db.rs) to mitigate locks, but conflicts can still occur if database connections are leaked or corrupt.

### Remedies:
1. **Kill zombie processes:** Ensure no dangling Tauri instances are running in the background:
   ```bash
   pkill -f tauri-app
   ```
2. **Clear temporary lock files:** If the database becomes corrupted, close the app and remove the WAL journal logs:
   ```bash
   rm -f "/Users/chris/Library/Application Support/com.chronicle.loreweaver/loreweaver.db-wal"
   rm -f "/Users/chris/Library/Application Support/com.chronicle.loreweaver/loreweaver.db-shm"
   ```

---

## 2. Local ONNX Model Downloads Failing

### Cause:
When running search or indexing for the first time, [search.rs](file:///Users/chris/Development/loreweaver/src-tauri/src/search.rs) attempts to download the embedding model from Hugging Face. If the network is offline or Hugging Face is blocked, startup/indexing will fail with connection error logs.

### Manual Download Remedy:
You can download the search transformer assets manually and copy them directly to your app data folder:
```bash
# Create model path directory
mkdir -p "$HOME/Library/Application Support/com.chronicle.loreweaver/models/all-MiniLM-L6-v2"

# Download model
curl -L -o "$HOME/Library/Application Support/com.chronicle.loreweaver/models/all-MiniLM-L6-v2/model.onnx" \
  "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"

# Download tokenizer
curl -L -o "$HOME/Library/Application Support/com.chronicle.loreweaver/models/all-MiniLM-L6-v2/tokenizer.json" \
  "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json"
```

---

## 3. Plugin Loading and Hook Failures

### Cause 1: Permission Validation Error
Plugins must only claim the `"hooks"` permission in their manifest. Declaring unsupported permissions (e.g., `"network"`) triggers:
`Unsupported plugin permission: ...`

### Cause 2: Boa Engine JS Syntax Error
If the Javascript file fails to compile (e.g. contains modern ES6 features not fully supported by Boa v0.19), loading will fail with:
`JS Eval Error: ...` or `JS Call Error: ...`

### Remedies:
- Simplify Javascript scripts to standard ES5/ES6 syntax.
- Ensure the function names inside `index.js` exactly match the hook parameter names passed from the frontend (e.g., `on_dice_roll`).
- Check that the manifest JSON structure contains no missing trailing commas or syntax mistakes.
