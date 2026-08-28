//! # Plugin Event Bus (`event_bus.rs`)
//!
//! Fans app events out to every active plugin as named hook calls.
//!
//! ## Design
//! - Events are plain strings (`"image_generated"`, `"note_saved"`,
//!   `"world_state_changed"`); a plugin listens by defining the global hook
//!   `on_<event>` (e.g. `function on_image_generated(payload) { ... }`).
//! - The bus reuses the existing `run_plugin_hook` machinery from `plugins.rs`
//!   — the permission guard (still `"hooks"` only), 32 KiB payload cap, hook-name
//!   sanitization, 5 s wall-clock timeout, and `globalThis.__state` persistence
//!   all apply unchanged. The event bus introduces **no new permissions**.
//! - Payloads are `serde_json::Value`; they are serialized to a string before the
//!   hook call, matching the existing "argument is always a string" contract.
//! - **Never emit large artifacts** (e.g. image bytes) — the 32 KiB payload cap
//!   is enforced inside `run_plugin_hook`; event payloads carry summaries only.
//! - `emit_sync` is for tests and blocking contexts. Commands use `emit`, which
//!   detaches a thread so the async runtime is never blocked on plugin code.
//!
//! ## Safety
//! - A plugin that does not define the hook produces the existing
//!   `"Global function 'on_...' is not callable"` error; `emit_sync` silently
//!   drops those so a non-listener is never an error.
//! - Real plugin errors (eval failure, timeout, non-string return) are collected
//!   and returned by `emit_sync`, and logged by `emit`.

use crate::plugins;
use serde_json::Value;

/// Fired after a successful image generation call (`generate_image`).
///
/// Payload summary: `{ prompt, style, provider, model }` — never the image bytes.
pub const EVENT_IMAGE_GENERATED: &str = "image_generated";

/// Fired after a note is saved (`save_note`).
///
/// Payload: `{ id, title, path, word_count }`.
pub const EVENT_NOTE_SAVED: &str = "note_saved";

/// Fired after the world manifest changes (`update_bible_files`).
///
/// Payload: `{ world_id, name, bible_files }`.
pub const EVENT_WORLD_STATE_CHANGED: &str = "world_state_changed";

/// Maps an event name to the plugin hook that listens for it (`on_<event>`).
///
/// Event names must be ASCII alphanumeric + underscore (the same character set
/// `run_plugin_hook` already enforces for hook names); anything else is rejected
/// defensively and yields no hook name.
pub fn hook_name_for_event(event: &str) -> Option<String> {
    if event.is_empty() || !event.chars().all(|c| c == '_' || c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(format!("on_{}", event))
}

/// Synchronously fans an event out to every active plugin.
///
/// Returns the list of plugin errors that are NOT the benign
/// "hook is not callable" case (i.e. real failures worth surfacing).
/// Plugins without the matching hook are skipped silently.
pub fn emit_sync(vault_path: &str, event: &str, payload: Value) -> Vec<String> {
    let Some(hook_name) = hook_name_for_event(event) else {
        return vec![format!("Invalid event name: {}", event)];
    };

    let payload_string = match serde_json::to_string(&payload) {
        Ok(s) => s,
        Err(e) => return vec![format!("Failed to serialize event payload: {}", e)],
    };

    let mut errors = Vec::new();
    for plugin_id in plugins::active_plugin_ids() {
        match plugins::run_plugin_hook(vault_path, &plugin_id, &hook_name, &payload_string) {
            Ok(_) => {}
            Err(e) if e.contains("is not callable") => {
                // Plugin does not listen for this event — expected, skip.
            }
            Err(e) => errors.push(format!("plugin '{}': {}", plugin_id, e)),
        }
    }
    errors
}

/// Fire-and-forget event emission for command call sites.
///
/// Spawns a detached thread so plugin execution never blocks the async runtime.
/// Failures are logged via `eprintln!`; callers that need the result should use
/// `emit_sync` instead.
pub fn emit(vault_path: &str, event: &str, payload: Value) {
    let vault_path_owned = vault_path.to_string();
    let event_owned = event.to_string();
    std::thread::spawn(move || {
        let errors = emit_sync(&vault_path_owned, &event_owned, payload);
        for e in errors {
            eprintln!("[event_bus] event '{}': {}", event_owned, e);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugins::{load_all_plugins, plugin_state, plugin_test_guard};
    use std::fs;

    fn write_test_plugin(plugins_dir: &std::path::Path, id: &str, script: &str) {
        let dir = plugins_dir.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("manifest.json"),
            format!(
                r#"{{
  "id": "{}",
  "name": "{}",
  "version": "1.0.0",
  "description": "test plugin",
  "permissions": ["hooks"],
  "entry": "index.js"
}}"#,
                id, id
            ),
        )
        .unwrap();
        fs::write(dir.join("index.js"), script).unwrap();
    }

    /// The Increment A gate: a plugin receives an `image_generated` event and
    /// persists world state (in-memory + on disk after a simulated restart).
    #[test]
    fn test_plugin_receives_image_event_and_persists_state() {
        // Serialize against other tests mutating the process-global plugin registries.
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("my-world");
        fs::create_dir_all(&vault).unwrap();
        let plugins_dir = tmp.path().join("plugins");

        write_test_plugin(
            &plugins_dir,
            "image-watcher",
            r#"
            function on_image_generated(payload) {
                let evt = JSON.parse(payload);
                __state.last_event = evt.event;
                __state.last_provider = evt.provider;
                __state.world_version = (__state.world_version || 0) + 1;
                return "ok";
            }
            "#,
        );

        let vault_str = vault.to_str().unwrap();
        let plugins_str = plugins_dir.to_str().unwrap();
        let loaded = load_all_plugins(vault_str, plugins_str).unwrap();
        assert_eq!(loaded.len(), 1, "test plugin should load");

        let payload = serde_json::json!({
            "event": "image_generated",
            "prompt": "a ruined temple",
            "style": "painterly",
            "provider": "comfyui",
            "model": "sdxl"
        });

        let errors = emit_sync(vault_str, EVENT_IMAGE_GENERATED, payload);
        assert!(
            errors.is_empty(),
            "event fan-out should succeed, got: {:?}",
            errors
        );

        // In-memory state must reflect the hook's mutations.
        let state_json = plugin_state(vault_str, "image-watcher").unwrap_or_default();
        let state: Value = serde_json::from_str(&state_json).unwrap();
        assert_eq!(state["last_event"], "image_generated");
        assert_eq!(state["last_provider"], "comfyui");
        assert_eq!(state["world_version"], 1);

        // On-disk state file must exist under <plugins_dir>/.state/<vault>/.
        let sanitized_vault = vault_str
            .replace('/', "_")
            .replace('\\', "_")
            .replace(':', "_");
        let state_file = plugins_dir
            .join(".state")
            .join(sanitized_vault)
            .join("image-watcher.json");
        assert!(
            state_file.exists(),
            "state file should be persisted: {}",
            state_file.display()
        );
        let disk_json = fs::read_to_string(&state_file).unwrap();
        let disk_state: Value = serde_json::from_str(&disk_json).unwrap();
        assert_eq!(disk_state["last_provider"], "comfyui");
        assert_eq!(disk_state["world_version"], 1);

        // Simulated restart: reload and confirm state is restored.
        let reloaded = load_all_plugins(vault_str, plugins_str).unwrap();
        assert_eq!(reloaded.len(), 1);
        let restored = plugin_state(vault_str, "image-watcher").unwrap_or_default();
        let restored_state: Value = serde_json::from_str(&restored).unwrap();
        assert_eq!(restored_state["last_provider"], "comfyui");
        assert_eq!(restored_state["world_version"], 1);
    }

    #[test]
    fn test_emit_skips_plugins_without_listener() {
        // Serialize against other tests mutating the process-global plugin registries.
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("quiet-world");
        fs::create_dir_all(&vault).unwrap();
        let plugins_dir = tmp.path().join("plugins");

        write_test_plugin(
            &plugins_dir,
            "quiet-plugin",
            r#"
            function on_dice_roll(payload) {
                return "rolled";
            }
            "#,
        );

        let vault_str = vault.to_str().unwrap();
        load_all_plugins(vault_str, plugins_dir.to_str().unwrap()).unwrap();

        // No on_note_saved hook exists — emit_sync must not error.
        let errors = emit_sync(
            vault_str,
            EVENT_NOTE_SAVED,
            serde_json::json!({ "id": "n1", "title": "T", "path": "T.md", "word_count": 3 }),
        );
        assert!(
            errors.is_empty(),
            "plugin without the listener must be skipped silently, got: {:?}",
            errors
        );
    }

    #[test]
    fn test_hook_name_mapping() {
        assert_eq!(
            hook_name_for_event("image_generated").as_deref(),
            Some("on_image_generated")
        );
        assert_eq!(
            hook_name_for_event("note_saved").as_deref(),
            Some("on_note_saved")
        );
        assert_eq!(
            hook_name_for_event("world_state_changed").as_deref(),
            Some("on_world_state_changed")
        );
        // Invalid names are rejected.
        assert!(hook_name_for_event("bad name").is_none());
        assert!(hook_name_for_event("").is_none());
        assert!(hook_name_for_event("image-generated").is_none());
    }
}
