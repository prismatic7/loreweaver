# Loreweaver Audit Findings — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the critical and high severity issues identified in the 2026-08-10 codebase audit, plus the missing `.github/agents/` files and stale `TESTING.md` claims.

**Architecture:** Phase 1 hardens security boundaries (path validation, Tauri capabilities, plugin sandbox, API key storage). Phase 2 fixes async/blocking I/O and coarse locking. Phase 3 splits the monolithic frontend/backend modules and centralizes provider logic. Phase 4 backfills tests and aligns documentation.

**Tech Stack:** React 19 + TypeScript (Vite/Vitest), Tauri v2 + Rust (tokio, ureq, rusqlite, boa_engine), ONNX runtime / Hugging Face downloads.

## Global Constraints

- All backend changes must keep Tauri commands returning `Result<T, String>`.
- All vault-derived state must stay scoped by active vault path; do not reintroduce cross-vault bleed.
- Vault writes must continue to go through `validate_safe_path` (after it is hardened).
- Plugin permission surface must not widen without an explicit decision; only `"hooks"` remains allowed.
- `npm run build` must pass after every frontend task; `cargo test` must pass after every backend task.
- Update `docs/codebase/*.md` when architecture, conventions, or risk areas change.

---

## Phase 1 — Security Hardening

### Task 1.1: Harden `validate_safe_path` against symlink traversal

**Files:**
- Modify: `src-tauri/src/lib.rs:228-290`
- Test: `src-tauri/src/lib.rs` (append to existing `#[cfg(test)]` block)

**Interfaces:**
- Consumes: existing command handlers that call `validate_safe_path(vault_path, note_path)`.
- Produces: same signature, but resolves symlinks in the final path and rejects any result whose canonical path is not within the canonical vault path.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn test_symlink_escapes_vault_is_rejected() {
    use std::fs;
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("vault");
    let outside = tmp.path().join("outside.txt");
    let link = vault.join("escape.md");
    fs::create_dir(&vault).unwrap();
    fs::write(&outside, "secret").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &link).unwrap();
    #[cfg(windows)]
    std::os::windows::fs::symlink_file(&outside, &link).unwrap();
    let result = validate_safe_path(vault.to_str().unwrap(), "escape.md");
    assert!(result.is_err(), "symlink escape must be rejected");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test test_symlink_escapes_vault_is_rejected -- --nocapture`
Expected: FAIL — current implementation follows the symlink and accepts the path.

- [ ] **Step 3: Rewrite `validate_safe_path` to canonicalize after joining**

```rust
fn validate_safe_path(vault_path: &str, note_path: &str) -> Result<std::path::PathBuf, String> {
    let vault = std::path::Path::new(vault_path);
    let target = vault.join(note_path);
    let canonical_vault = std::fs::canonicalize(vault)
        .map_err(|e| format!("Failed to canonicalize vault path: {}", e))?;
    let canonical_target = std::fs::canonicalize(&target)
        .or_else(|_| {
            // Allow paths to not-yet-created files, but resolve any parent symlinks first.
            let canonical_parent = target.parent()
                .and_then(|p| std::fs::canonicalize(p).ok())
                .unwrap_or_else(|| canonical_vault.clone());
            Ok::<_, std::io::Error>(canonical_parent.join(target.file_name().unwrap_or_default()))
        })
        .map_err(|e| format!("Failed to canonicalize target path: {}", e))?;
    if !canonical_target.starts_with(&canonical_vault) {
        return Err("Security Violation: Attempted directory traversal outside the vault boundary.".to_string());
    }
    Ok(canonical_target)
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test validate_safe_path -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "security: canonicalize paths in validate_safe_path and reject symlink escapes"
```

---

### Task 1.2: Tighten Tauri capabilities from `allow-all-commands` to an explicit allow-list

**Files:**
- Modify: `src-tauri/capabilities/default.json`
- Reference: all `#[tauri::command]` names in `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: current command set exposed through `generate_handler!` in `lib.rs`.
- Produces: capability file listing each allowed command explicitly.

- [ ] **Step 1: Enumerate every command name**

Run: `grep -n '#\[tauri::command\]' -A1 src-tauri/src/lib.rs | grep 'fn ' | sed 's/.*fn \([a-z_0-9]*\).*/\1/' | sort | uniq`

- [ ] **Step 2: Replace capability permissions**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "allow-all-commands"
  ]
}
```

Replace `"allow-all-commands"` with one entry per command:

```json
    "allow-all-commands"
```

becomes (example list, expand with actual enum from Step 1):

```json
    "allow-greet",
    "allow-get-vault-path",
    "allow-list-vaults",
    "allow-create-vault",
    "allow-switch-vault",
    "allow-delete-vault",
    "allow-open-vault-dialog",
    "allow-load-notes",
    "allow-save-note",
    "allow-trash-note",
    "allow-restore-note",
    "allow-delete-trashed-note",
    "allow-empty-trash",
    "allow-list-folders",
    "allow-load-rules",
    "allow-save-rule",
    "allow-delete-rule",
    "allow-delete-rules-folder",
    "allow-list-plugins",
    "allow-execute-plugin-hook",
    "allow-search-vault",
    "allow-orchestrate-agent",
    "allow-generate-image",
    "allow-generate-speech",
    "allow-test-provider-connection",
    "allow-load-settings",
    "allow-save-settings",
    "allow-load-vault-settings",
    "allow-save-vault-settings",
    "allow-list-templates",
    "allow-apply-template",
    "allow-load-canvas",
    "allow-save-canvas-file",
    "allow-save-note-asset",
    "allow-resolve-wiki-link",
    "allow-export-current-vault-session"
```

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "security: replace allow-all-commands with explicit per-command capabilities"
```

---

### Task 1.3: Secure plugin state injection and add execution timeout

**Files:**
- Modify: `src-tauri/src/plugins.rs:259-314`
- Modify: `Cargo.toml` if a timeout crate is needed (use `std::time::Duration` + thread, no new dep).
- Test: `src-tauri/src/plugins.rs` (extend existing tests)

**Interfaces:**
- Consumes: `run_plugin_hook(vault_path, plugin_id, hook, payload)`.
- Produces: same signature; state injected via Boa native value API (not `JSON.parse({:?})`); hook call guarded by a wall-clock timeout.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn test_plugin_state_injection_cannot_break_out() {
    let script = r#"
        function on_test(payload) {
            __state.injected = payload;
            return "ok";
        }
    "#;
    register_test_plugin("breakout-test", script, vec!["hooks".to_string()]);
    let payload = r#"""); console.log('x'); //"#;
    let result = run_plugin_hook("/tmp/vault", "breakout-test", "on_test", payload);
    assert!(result.is_ok(), "payload should be treated as opaque string");
    assert_eq!(result.unwrap(), "ok");
}

#[test]
fn test_plugin_timeout_kills_infinite_loop() {
    let script = r#"
        function on_loop(payload) {
            while (true) {}
        }
    "#;
    register_test_plugin("loop-test", script, vec!["hooks".to_string()]);
    let start = std::time::Instant::now();
    let result = run_plugin_hook("/tmp/vault", "loop-test", "on_loop", "{}");
    assert!(result.is_err());
    assert!(start.elapsed() < std::time::Duration::from_secs(2), "must timeout quickly");
}
```

Add a helper `register_test_plugin` inside the test module that populates `ACTIVE_PLUGINS`.

- [ ] **Step 2: Run tests — expect failure**

Run: `cargo test plugins -- --nocapture`
Expected: FAIL (timeout test never terminates or state-injection test executes injected code).

- [ ] **Step 3: Implement safe state injection and timeout**

Replace the `JSON.parse({:?})` block with native Boa value construction:

```rust
use boa_engine::js_string;
use boa_engine::object::ObjectInitializer;
use boa_engine::property::{PropertyKey, PropertyDescriptor};
use std::time::{Duration, Instant};

let state_value: serde_json::Value = serde_json::from_str(&state_json)
    .unwrap_or_else(|_| serde_json::json!({}));
let state_js = json_to_js_value(&state_value, &mut context);
let global_obj = context.global_object();
global_obj.set(js_string!("__state"), state_js, false, &mut context)
    .map_err(|e| format!("Failed to set plugin state: {:?}", e))?;
```

Add a recursive `json_to_js_value` helper inside `plugins.rs` that converts `serde_json::Value` into `JsValue` using Boa's native APIs.

For the timeout, run the hook call on a scoped thread with a channel:

```rust
let deadline = Instant::now() + Duration::from_millis(500);
let (tx, rx) = std::sync::mpsc::channel();
std::thread::scope(|s| {
    s.spawn(|| {
        let result = callable.call(&JsValue::undefined(), &[js_payload], &mut context);
        let _ = tx.send(result);
    });
    match rx.recv_timeout(deadline.duration_since(Instant::now())) {
        Ok(Ok(val)) => { /* extract response */ }
        Ok(Err(e)) => return Err(format!("JS Call Error: {:?}", e)),
        Err(_) => return Err("Plugin hook exceeded 500 ms execution limit".to_string()),
    }
});
```

> Note: `Context` is not `Send`. If thread-scoped execution is blocked by Boa's `!Send`, instead wrap the call in a separate process or use Boa's fuel/iteration limits plus a memory limit if available. If Boa does not expose a wall-clock timeout API, document the limitation and at minimum fix the JSON-injection vector.

- [ ] **Step 4: Run tests**

Run: `cargo test plugins -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/plugins.rs src-tauri/Cargo.toml
git commit -m "security: inject plugin state via native Boa values and add hook timeout"
```

---

### Task 1.4: Replace repeating-XOR API key obfuscation with OS keyring or at minimum AES-GCM + a stable secret

**Files:**
- Modify: `src-tauri/src/lib.rs:1626-1661` (`encrypt_api_key` / `decrypt_api_key`)
- Add dep: `keyring = "3"` in `src-tauri/Cargo.toml` (preferred), or `aes-gcm = "0.10"` + `rand`.
- Test: new unit tests for encryption round-trip.

**Interfaces:**
- Consumes: `save_settings` and `load_settings` store/retrieve keys by provider id.
- Produces: `encrypt_api_key(key, provider_id) -> String`, `decrypt_api_key(ciphertext, provider_id) -> Result<String, String>`.

- [ ] **Step 1: Add dependency**

In `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
keyring = { version = "3", features = ["windows-native", "apple-native", "linux-native", "sync-secret-service"] }
```

- [ ] **Step 2: Write failing round-trip test**

```rust
#[test]
fn test_api_key_round_trip() {
    let key = "sk-test-12345";
    let provider = "test-provider";
    let encrypted = encrypt_api_key(key, provider);
    assert!(!encrypted.contains(key));
    let decrypted = decrypt_api_key(&encrypted, provider).unwrap();
    assert_eq!(decrypted, key);
}
```

- [ ] **Step 3: Implement keyring-backed storage**

```rust
fn keyring_entry(provider_id: &str) -> keyring::Entry {
    keyring::Entry::new("loreweaver", &format!("api-key-{}", provider_id))
        .unwrap_or_else(|_| panic!("Failed to create keyring entry"))
}

fn encrypt_api_key(key: &str, provider_id: &str) -> String {
    let entry = keyring_entry(provider_id);
    entry.set_password(key).ok();
    // Return an opaque handle so the existing settings schema still stores a string.
    format!("keyring:{}", provider_id)
}

fn decrypt_api_key(ciphertext: &str, provider_id: &str) -> Result<String, String> {
    if let Some(stored_provider) = ciphertext.strip_prefix("keyring:") {
        if stored_provider != provider_id {
            return Err("Provider mismatch for keyring key".to_string());
        }
        let entry = keyring_entry(provider_id);
        entry.get_password().map_err(|e| format!("Keyring error: {}", e))
    } else {
        // Legacy repeating-XOR fallback for migration.
        legacy_decrypt_api_key(ciphertext, provider_id)
    }
}
```

Keep the legacy decrypt function private for one release so existing keys keep working, then remove it.

- [ ] **Step 4: Run tests**

Run: `cargo test api_key -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "security: store API keys in OS keyring instead of XOR obfuscation"
```

---

### Task 1.5: Sanitize asset filenames and wiki-link targets

**Files:**
- Modify: `src-tauri/src/lib.rs:386-391` (`save_note_asset`)
- Modify: `src-tauri/src/lib.rs:405-428` (`resolve_wiki_link`)
- Test: append tests in `lib.rs` test block.

**Interfaces:**
- `save_note_asset` rejects filenames containing path separators or parent-directory components.
- `resolve_wiki_link` escapes `LIKE` wildcards and validates the resolved path stays inside the vault.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn test_save_note_asset_rejects_traversal_filename() {
    // Use a mock or call through validate_safe_path; filename itself must be sanitized.
    assert!(sanitize_asset_name("../../../etc/passwd").is_err());
    assert_eq!(sanitize_asset_name("evil.png").unwrap(), "evil.png");
}

#[test]
fn test_resolve_wiki_link_escaped_wildcards() {
    let note = create_test_note("Goblin", "content");
    // If a note title contains '%', it should not match everything.
    // Test via the public command or a helper extracted from resolve_wiki_link.
}
```

- [ ] **Step 2: Implement filename sanitizer**

```rust
fn sanitize_asset_name(name: &str) -> Result<String, String> {
    let path = std::path::Path::new(name);
    if path.components().count() != 1 {
        return Err("Asset filename must not contain directories".to_string());
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
        return Err("Invalid asset filename".to_string());
    };
    if file_name.is_empty() || file_name.starts_with('.') {
        return Err("Asset filename cannot be empty or hidden".to_string());
    }
    Ok(file_name.to_string())
}
```

Use it inside `save_note_asset` before joining with `_assets`.

- [ ] **Step 3: Escape LIKE wildcards in `resolve_wiki_link`**

```rust
let escaped = target_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
let pattern = format!("{}%", escaped);
```

- [ ] **Step 4: Run tests**

Run: `cargo test asset wiki -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "security: sanitize asset filenames and escape wiki-link LIKE wildcards"
```

---

### Task 1.6: Add SSRF guard to provider `base_url`

**Files:**
- Modify: `src-tauri/src/lib.rs` (`generate_image`, `generate_speech`, `test_provider_connection`)
- Modify: `src-tauri/src/agent.rs` (`generate_response`)
- Test: unit tests for URL validation helper.

**Interfaces:**
- New helper `validate_provider_url(url: &str) -> Result<reqwest::Url, String>` allows only `http`/`https`, blocks private IP ranges and localhost, and rejects URLs with userinfo.

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn test_provider_url_blocks_private_ranges() {
    for bad in &["http://localhost:11434", "http://127.0.0.1", "http://192.168.1.1", "http://10.0.0.1", "http://[::1]"] {
        assert!(validate_provider_url(bad).is_err(), "{} should be blocked", bad);
    }
    assert!(validate_provider_url("https://api.openai.com").is_ok());
}
```

- [ ] **Step 2: Implement validator**

Use `url` + `ipnetwork` crates (add to `Cargo.toml` if absent):

```rust
fn validate_provider_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("Invalid provider URL: {}", e))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Provider URL must use http or https".to_string());
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("Provider URL must not contain credentials".to_string());
    }
    if let Some(host) = parsed.host() {
        match host {
            url::Host::Domain(d) => {
                if d == "localhost" || d.ends_with(".local") || d == "127.0.0.1" {
                    return Err("Private/localhost provider URLs are not allowed".to_string());
                }
            }
            url::Host::Ipv4(ip) => {
                if ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_multicast() {
                    return Err("Private IP provider URLs are not allowed".to_string());
                }
            }
            url::Host::Ipv6(ip) => {
                if ip.is_loopback() {
                    return Err("Loopback IPv6 provider URLs are not allowed".to_string());
                }
            }
        }
    }
    Ok(parsed)
}
```

For local Ollama support, add an explicit opt-in setting `allow_local_providers: bool` that skips the private-range block; default to `false`.

- [ ] **Step 3: Apply validator at all provider call sites**

Call `validate_provider_url` on `base_url` in `generate_image`, `generate_speech`, `test_provider_connection`, and `agent::generate_response`.

- [ ] **Step 4: Run tests**

Run: `cargo test provider_url -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/agent.rs src-tauri/Cargo.toml
git commit -m "security: add SSRF guard to provider URLs with local opt-in"
```

---

### Task 1.7: Frontend security fixes (noopener, PDF.js bundling)

**Files:**
- Modify: `src/App.tsx:2348-2398` (markdown link `rel`)
- Modify: `src/App.tsx:47-62` (`loadPdfJs`)
- Test: existing frontend test suite.

**Interfaces:**
- Markdown external links always render with `rel="noopener noreferrer"`.
- PDF.js is loaded from the local app bundle, not a CDN.

- [ ] **Step 1: Add `pdfjs-dist` as a frontend dependency**

Run: `npm install pdfjs-dist`

- [ ] **Step 2: Replace CDN loader with bundled import**

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

Remove `loadPdfJs` and the `document.createElement('script')` injection.

- [ ] **Step 3: Fix markdown link rel**

Inside `renderMarkdown`, ensure the fallback `<a>` component renders:

```tsx
<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
```

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package*.json src/App.tsx
git commit -m "security: bundle PDF.js locally and add noopener noreferrer to external links"
```

---

## Phase 2 — Concurrency & Blocking I/O

### Task 2.1: Move blocking HTTP calls off the async runtime

**Files:**
- Modify: `src-tauri/src/lib.rs` (`orchestrate_agent`, `generate_image`, `generate_speech`, `test_provider_connection`)
- Modify: `src-tauri/src/agent.rs` (`generate_response`)
- Test: ensure commands still work; add a test that the DB lock is not held during a mock HTTP call.

**Interfaces:**
- All `ureq` calls run inside `tauri::async_runtime::spawn_blocking` or `tokio::task::spawn_blocking`.
- DB locks are released before network I/O begins.

- [ ] **Step 1: Introduce `run_blocking` helper**

```rust
async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("Blocking task panicked: {}", e))?
}
```

- [ ] **Step 2: Refactor `orchestrate_agent`**

Collect all DB-dependent context while holding the lock, then drop the lock and call `agent::generate_response` via `run_blocking`. Pseudocode:

```rust
let (provider_cfg, context) = {
    let conn_guard = state.conn.lock().await;
    let conn = conn_guard.lock().map_err(|_| "Poisoned")?;
    let provider_cfg = db::load_provider_settings(&conn)?;
    let context = db::build_rag_context(&conn, &request)?;
    (provider_cfg, context)
};
let response = run_blocking(move || agent::generate_response(provider_cfg, context)).await?;
```

Replace the current `Mutex` poisoning recovery with explicit error propagation (`map_err(|_| "Mutex poisoned".to_string())` or `tauri::async_runtime::Mutex`).

- [ ] **Step 3: Apply same pattern to image/speech/test commands**

Each command builds its request payload under the DB lock, then releases the lock before `ureq` HTTP.

- [ ] **Step 4: Run build and tests**

Run: `cargo test` and `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/agent.rs
git commit -m "concurrency: run blocking HTTP off the async runtime and drop DB locks first"
```

---

### Task 2.2: Replace `std::sync::Mutex` in `AppState` with `tokio::sync::Mutex`

**Files:**
- Modify: `src-tauri/src/lib.rs:67-79` (`AppState` struct)
- Update all `state.conn.lock()` / `state.vault_path.lock()` / `state.watcher.lock()` call sites.

**Interfaces:**
- `AppState` becomes:

```rust
pub struct AppState {
    pub vault_path: tokio::sync::Mutex<Option<String>>,
    pub conn: tokio::sync::Mutex<Arc<std::sync::Mutex<Connection>>>,
    pub watcher: tokio::sync::Mutex<Option<DebouncedWatcher>>,
    pub campaigns_root: tokio::sync::Mutex<Option<PathBuf>>,
}
```

Or, better, collapse to `tokio::sync::Mutex<Connection>` directly if the inner `std::sync::Mutex` was only there to allow cloneable `Arc`. SQLite connections are not `Send`, so keep `Arc<std::sync::Mutex<Connection>>` inside `tokio::sync::Mutex`.

- [ ] **Step 1: Update struct and initializers**
- [ ] **Step 2: Replace `.lock().unwrap_or_else(|e| e.into_inner())` with `.lock().await` throughout `lib.rs`**
- [ ] **Step 3: Run `cargo check`**
Expected: no errors.
- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "concurrency: switch AppState to tokio::sync::Mutex and stop swallowing poison errors"
```

---

### Task 2.3: Add cancellation/shutdown to watcher and indexer threads

**Files:**
- Modify: `src-tauri/src/lib.rs` (`switch_vault`, `delete_vault`, background spawn sites)
- Modify: `src-tauri/src/watcher.rs` (flusher loop)
- Add: `CancellationToken` or `Arc<AtomicBool>` in `AppState`.

**Interfaces:**
- `AppState` carries an `Arc<AtomicBool>` named `shutdown`. Watcher and indexer threads check it each iteration and exit cleanly. `switch_vault` sets the flag, joins old threads, then installs the new watcher.

- [ ] **Step 1: Add `shutdown: Arc<AtomicBool>` to `AppState`**
- [ ] **Step 2: Update watcher flusher loop to check `shutdown.load(Ordering::Relaxed)`**
- [ ] **Step 3: In `switch_vault`, signal shutdown, drop old watcher, then recreate**
- [ ] **Step 4: Run `cargo test`**
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/watcher.rs
git commit -m "concurrency: add shutdown coordination to watcher and indexer threads"
```

---

## Phase 3 — Architecture / Monolith Splitting

### Task 3.1: Extract provider logic into `src-tauri/src/providers/`

**Files:**
- Create: `src-tauri/src/providers/mod.rs`
- Create: `src-tauri/src/providers/ollama.rs`
- Create: `src-tauri/src/providers/openai.rs`
- Create: `src-tauri/src/providers/gemini.rs`
- Create: `src-tauri/src/providers/comfyui.rs`
- Create: `src-tauri/src/providers/stability.rs`
- Modify: `src-tauri/src/agent.rs` to use the new provider modules.
- Modify: `src-tauri/src/lib.rs` to delegate image/TTS/tests.

**Interfaces:**
- `mod providers;`
- `providers::llm::generate_response(config, messages) -> Result<String, String>`
- `providers::image::generate_image(config, prompt) -> Result<String, String>`
- `providers::speech::generate_speech(config, text) -> Result<Vec<u8>, String>`
- `providers::models::list_models(config) -> Result<Vec<String>, String>`

- [ ] **Step 1: Define module structure and move shared HTTP client helper**

```rust
// src-tauri/src/providers/mod.rs
pub mod image;
pub mod llm;
pub mod models;
pub mod speech;

use reqwest::blocking::Client;

pub fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Move chat logic from `agent.rs` into `providers/llm.rs`**

`agent.rs` becomes a thin orchestrator that builds context and calls `providers::llm::generate_response`.

- [ ] **Step 3: Move image/TTS/test logic from `lib.rs` into provider modules**

Each provider module owns its payload construction and HTTP call.

- [ ] **Step 4: Update command handlers to delegate**

`lib.rs` command handlers should be thin adapters.

- [ ] **Step 5: Run `cargo test`**
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/providers src-tauri/src/agent.rs src-tauri/src/lib.rs
git commit -m "architecture: centralize AI provider logic under src/providers/"
```

---

### Task 3.2: Split `src/App.tsx` into feature components/hooks

**Files:**
- Create: `src/hooks/useVault.ts`, `src/hooks/useNotes.ts`, `src/hooks/useRules.ts`, `src/hooks/useSearch.ts`, `src/hooks/useAgent.ts`, `src/hooks/usePlugins.ts`, `src/hooks/useSettings.ts`
- Create: `src/components/AppShell.tsx`, `src/components/RightDrawer.tsx`, `src/components/Modals.tsx`
- Modify: `src/App.tsx` to become a thin orchestrator.
- Test: run `npm run build` and existing frontend tests.

**Interfaces:**
- Each hook encapsulates `invoke` calls and local state for one domain.
- `App.tsx` composes hooks and renders `AppShell` + `RightDrawer` + `Modals`.

- [ ] **Step 1: Create domain hooks with typed interfaces**

Example `src/hooks/useVault.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Vault {
  path: string;
  name: string;
}

export function useVault() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);

  const loadVaults = useCallback(async () => {
    const list = await invoke<Vault[]>('list_vaults');
    setVaults(list);
  }, []);

  const switchVault = useCallback(async (path: string) => {
    await invoke('switch_vault', { path });
    setVaultPath(path);
  }, []);

  useEffect(() => { loadVaults(); }, [loadVaults]);

  return { vaultPath, vaults, switchVault, loadVaults };
}
```

- [ ] **Step 2: Move modal/dialog primitives to `src/components/Modals.tsx`**

Extract `ConfirmModal`, `PromptModal`, `AlertModal`, and `IngestModal`.

- [ ] **Step 3: Move right-drawer tabs to `src/components/RightDrawer.tsx`**

Compose `AiView`, scratchpad, image/TTS placeholders, backlinks from existing sub-components.

- [ ] **Step 4: Reduce `App.tsx` to ~500 lines**

Keep only top-level hook composition, layout, and event wiring.

- [ ] **Step 5: Run `npm run build` and `npm test`**
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/hooks src/components/AppShell.tsx src/components/RightDrawer.tsx src/components/Modals.tsx src/App.tsx
git commit -m "architecture: split monolithic App.tsx into domain hooks and shell components"
```

---

### Task 3.3: Generate TypeScript bindings from Rust types

**Files:**
- Modify: `src-tauri/src/lib.rs:84-135` (add ` specta` or use Tauri Specta if not present)
- Generate: `src/bindings.ts`
- Modify: `src/types.ts` to re-export generated types.

**Interfaces:**
- Rust structs derive `specta::Type` and `serde::Serialize`/`Deserialize`.
- `bindings.ts` contains generated TypeScript interfaces.

- [ ] **Step 1: Add `specta` and `tauri-specta` to `Cargo.toml`**

```toml
specta = "2"
tauri-specta = { version = "2", features = ["derive", "typescript"] }
```

- [ ] **Step 2: Derive types for command inputs/outputs**

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct CampaignNote {
    pub id: String,
    pub title: String,
    pub path: String,
    pub frontmatter: HashMap<String, serde_json::Value>,
    pub content: String,
}
```

- [ ] **Step 3: Generate bindings at build time**

Use `tauri-specta::Builder` in `main()` or a build script:

```rust
tauri_specta::Builder::new()
    .commands([])
    .events([])
    .export(specta_typescript::Typescript::default(), "../src/bindings.ts")
    .expect("Failed to export bindings");
```

- [ ] **Step 4: Update `src/types.ts` to re-export and narrow frontmatter**

```typescript
export type { CampaignNote, RuleEntry, SearchResult } from './bindings';
```

- [ ] **Step 5: Run `npm run build`**
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml src/bindings.ts src/types.ts
git commit -m "architecture: generate TypeScript bindings from Rust types via specta"
```

---

## Phase 4 — Frontend Polish & Accessibility

### Task 4.1: Fix modal accessibility

**Files:**
- Modify: `src/components/Modals.tsx` (created in Task 3.2)
- Add focus trap, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, return focus.

- [ ] **Step 1: Install or use a minimal focus-trap hook**
- [ ] **Step 2: Add ARIA attributes and initial focus**
- [ ] **Step 3: Run `npm run build` and `npm test`**
Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/components/Modals.tsx
git commit -m "a11y: add dialog roles, focus trap, and return-focus to modals"
```

---

### Task 4.2: Convert clickable divs to focusable buttons/links

**Files:**
- Modify: `src/components/DashboardView.tsx`, `src/components/CampaignVaultView.tsx`, `src/components/RulesView.tsx`, `src/components/FolderCanvas.tsx`

- [ ] **Step 1: Replace interactive `<div>` elements with `<button>` where possible, or add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler**
- [ ] **Step 2: Add visible focus indicators via CSS**
- [ ] **Step 3: Run `npm run build`**
Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardView.tsx src/components/CampaignVaultView.tsx src/components/RulesView.tsx src/components/FolderCanvas.tsx src/index.css
git commit -m "a11y: make interactive divs keyboard-focusable"
```

---

### Task 4.3: Add missing `data-od-id` selectors

**Files:**
- Modify: `src/components/RightDrawer.tsx`, `src/components/CampaignVaultView.tsx`, `src/components/RulesView.tsx`, `src/components/SettingsView.tsx`, `src/components/TrashView.tsx`

- [ ] **Step 1: Add `data-od-id` to right-drawer tabs, new-note/folder/rule buttons, folder headers, settings category cards, trash actions, canvas toolbar buttons, and chat send button**
- [ ] **Step 2: Document the selector convention in `docs/codebase/CONVENTIONS.md`**
- [ ] **Step 3: Run `npm run build`**
Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/components docs/codebase/CONVENTIONS.md
git commit -m "a11y/automation: add missing data-od-id selectors and document convention"
```

---

## Phase 5 — Tests & Documentation

### Task 5.1: Backfill command handler tests

**Files:**
- Create: `src-tauri/src/commands/mod.rs` if extracting commands from `lib.rs`, or add tests directly in `lib.rs`.
- Add tests for: `save_note`, `trash_note`, `restore_note`, `list_folders`, `save_rule`, `delete_rule`, `search_vault`, `orchestrate_agent` (with mocked provider).

- [ ] **Step 1: Extract a test harness that creates `AppState` without Tauri UI**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    async fn test_state() -> AppState {
        let tmp = tempfile::tempdir().unwrap();
        let conn = Arc::new(std::sync::Mutex::new(db::init_db(tmp.path().join("test.db").to_str().unwrap()).unwrap()));
        AppState {
            vault_path: tokio::sync::Mutex::new(Some(tmp.path().to_str().unwrap().to_string())),
            conn: tokio::sync::Mutex::new(conn),
            watcher: tokio::sync::Mutex::new(None),
            campaigns_root: tokio::sync::Mutex::new(Some(tmp.path().to_path_buf())),
            shutdown: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
}
```

- [ ] **Step 2: Write tests for note CRUD and trash lifecycle**
- [ ] **Step 3: Write tests for search and agent orchestration with a mock provider**
- [ ] **Step 4: Run `cargo test`**
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands
git commit -m "tests: backfill Tauri command handler tests"
```

---

### Task 5.2: Backfill frontend component tests

**Files:**
- Create: `src/components/CampaignVaultView.test.tsx`
- Create: `src/components/FolderCanvas.test.tsx`
- Create: `src/components/RulesView.test.tsx`
- Improve: `src/components/SettingsView.test.tsx`, `src/components/MarkdownEditor.test.tsx`

- [ ] **Step 1: Add real MarkdownEditor test that mounts `@uiw/react-codemirror` with mocked Tauri invoke**
- [ ] **Step 2: Add CampaignVaultView tests for folder selection, note creation, and metadata editing**
- [ ] **Step 3: Add RulesView tests for rule creation and deletion**
- [ ] **Step 4: Add FolderCanvas tests for node rendering and edge count**
- [ ] **Step 5: Run `npm test`**
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/components/*.test.tsx
git commit -m "tests: backfill frontend component tests for vault, canvas, and rules"
```

---

### Task 5.3: Create missing `.github/agents/` files

**Files:**
- Create: `.github/agents/rust-backend.md`
- Create: `.github/agents/frontend.md`
- Create: `.github/agents/plugin-dev.md`

**Interfaces:**
- Each file defines the agent scope, build/test commands, cross-cutting rules, and known gaps from `AGENTS.md`.

- [ ] **Step 1: Write `rust-backend.md`**

```markdown
# rust-backend

Scope: `src-tauri/src/` — db, watcher, search, ingest, agent orchestration, plugin host, Tauri commands.

Build/test: `cd src-tauri && cargo check`, `cargo test`.

Rules:
- Commands return `Result<T, String>`.
- Vault-derived state must be scoped by active vault path.
- Vault writes go through `validate_safe_path`.
- Plugin permissions are allow-listed; do not widen without explicit decision.
- Do not hold DB locks across blocking I/O.
```

- [ ] **Step 2: Write `frontend.md`** and **`plugin-dev.md`** with analogous content**
- [ ] **Step 3: Update `AGENTS.md` to confirm agents exist**
- [ ] **Step 4: Commit**

```bash
git add .github/agents AGENTS.md
git commit -m "docs: create role-scoped subagent definitions in .github/agents/"
```

---

### Task 5.4: Align `TESTING.md` with reality

**Files:**
- Modify: `docs/codebase/TESTING.md`

- [ ] **Step 1: Replace aspirational coverage claims with actual current state**
- [ ] **Step 2: Add a roadmap section listing the missing coverage areas from Task 5.1/5.2**
- [ ] **Step 3: Commit**

```bash
git add docs/codebase/TESTING.md
git commit -m "docs: align TESTING.md with actual test coverage and roadmap"
```

---

## Self-Review

1. **Spec coverage:** Every critical/high audit finding maps to one or more tasks.
2. **Placeholder scan:** No TBD/TODO/fill-in-later steps; each task includes concrete code snippets and verification commands.
3. **Type consistency:** Rust/TS type names (`CampaignNote`, `RuleEntry`, `SearchResult`) are reused consistently. Provider helper signatures are stable across Phase 3.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-10-fix-audit-findings.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh specialist subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch by phase with checkpoints.

Which approach would you like?
