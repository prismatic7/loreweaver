//! # JavaScript Plugin Host Architecture (Boa Engine)
//!
//! Loreweaver supports user-defined extensions via JavaScript plugins executed inside an
//! embedded ECMAScript engine powered by [`boa_engine`].
//!
//! ## Architectural Principles
//! 1. **Embedded Synchronous JS Sandbox**: Plugins run strictly within synchronous Boa `Context`s
//!    without access to Node.js / browser APIs or direct file system access.
//! 2. **Strict Permission Allow-List**: Plugins must declare explicit permissions in `manifest.json`.
//!    Only `"hooks"`, `"ui"`, and `"media"` (`ALLOWED_PERMISSIONS`) are permitted. The `"ui"`
//!    permission lets a plugin declare *declarative* panels (data rendered by the host, never
//!    plugin-supplied HTML); the `"media"` permission is reserved for cue-pack data. Unknown
//!    permissions are rejected at discovery.
//! 3. **Per-Vault State Isolation**: State mutated by plugins (`globalThis.__state`) is serialized
//!    to JSON and isolated per vault path in `PLUGIN_STATES`, preventing cross-vault state leakage.
//! 4. **Resource Constraints & Safety Caps**:
//!    - Maximum script size: 1 MiB (`MAX_SCRIPT_SIZE`).
//!    - Maximum hook payload: 32 KiB.
//!    - Loop iteration limit: 50,000 iterations per execution context to prevent infinite loops.
//!    - Recursion limit: 256 (explicit, tightened from Boa's 512 default).
//!    - Stack size limit: 512 (explicit, tightened from Boa's 1024 default).
//!    - Wall-clock timeout: 5 s per hook via a dedicated thread + `recv_timeout`.
//!    - **No heap-memory cap**: Boa 0.19 exposes no allocation limit, so a plugin
//!      that allocates unbounded memory (e.g. `new Array(1e9)`) is bounded only by
//!      process memory. See CONCERNS.md for the accepted risk.
//! 5. **Safe Injection**: Plugin state is converted from `serde_json::Value` into native Boa values
//!    and set on `globalThis` directly, eliminating code injection through string interpolation.

use crate::{PluginInfo, UiAction, UiField, UiPanel};
use boa_engine::{
    js_string,
    object::{builtins::JsArray, JsObject},
    property::PropertyKey,
    value::JsValue,
    Context, Source,
};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// Validates requested permissions against the host's strict allow-list.
///
/// Only `"hooks"`, `"ui"`, and `"media"` are permitted. Any plugin requesting
/// undeclared or unknown permissions will be rejected during discovery.
fn validate_permissions(permissions: &[String]) -> Result<(), String> {
    const ALLOWED_PERMISSIONS: [&str; 3] = ["hooks", "ui", "media"];

    for permission in permissions {
        if !ALLOWED_PERMISSIONS.contains(&permission.as_str()) {
            return Err(format!("Unsupported plugin permission: {}", permission));
        }
    }

    Ok(())
}

/// Checks whether a loaded plugin possesses a specific permission.
fn has_permission(plugin: &PluginInfo, permission: &str) -> bool {
    plugin.permissions.iter().any(|value| value == permission)
}

/// Thread-safe process-wide storage for active plugin definitions.
static ACTIVE_PLUGINS: OnceLock<Mutex<HashMap<String, PluginInfo>>> = OnceLock::new();

/// Thread-safe process-wide storage for vault-scoped plugin state maps (`vault_path -> (plugin_id -> state_json)`).
static PLUGIN_STATES: OnceLock<Mutex<HashMap<String, HashMap<String, String>>>> = OnceLock::new();

/// Process-wide plugins directory, captured at load time so state files can be
/// persisted under `<plugins_dir>/.state/<sanitized-vault>/` — deliberately
/// OUTSIDE the vault so the notify watcher never sees plugin runtime state.
static PLUGINS_DIR: OnceLock<Mutex<String>> = OnceLock::new();

/// Accessor for global active plugins registry.
fn active_plugins() -> &'static Mutex<HashMap<String, PluginInfo>> {
    ACTIVE_PLUGINS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Accessor for global vault-scoped plugin state storage.
fn plugin_states() -> &'static Mutex<HashMap<String, HashMap<String, String>>> {
    PLUGIN_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Accessor for the process-wide plugins directory.
fn plugins_dir() -> &'static Mutex<String> {
    PLUGINS_DIR.get_or_init(|| Mutex::new(String::new()))
}

/// Serializes tests that mutate the process-global plugin registries.
///
/// `ACTIVE_PLUGINS` / `PLUGIN_STATES` / `PLUGINS_DIR` are process-wide statics;
/// `load_all_plugins` clears and repopulates them, so tests that register
/// plugins or run hooks concurrently can observe each other's state (cargo runs
/// tests in parallel by default). Every test that touches the plugin globals
/// must hold this guard for its whole body.
#[cfg(test)]
pub(crate) static PLUGIN_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Acquires the plugin-globals test serialization guard (see `PLUGIN_TEST_LOCK`).
#[cfg(test)]
pub(crate) fn plugin_test_guard() -> std::sync::MutexGuard<'static, ()> {
    PLUGIN_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Returns the ids of all currently active plugins (cloned; the caller may hold no lock).
///
/// Used by the event bus to fan an event out to every loaded plugin.
pub fn active_plugin_ids() -> Vec<String> {
    let guard = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
    guard.keys().cloned().collect()
}

/// Returns the serialized state JSON for `(vault_path, plugin_id)`, if any.
///
/// Test/observability accessor; the event bus tests use it to assert that a
/// plugin hook mutated `globalThis.__state`.
#[cfg(test)]
pub fn plugin_state(vault_path: &str, plugin_id: &str) -> Option<String> {
    let states = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
    states
        .get(vault_path)
        .and_then(|vault_states| vault_states.get(plugin_id))
        .cloned()
}

/// Resolves the on-disk state file for a `(vault_path, plugin_id)` pair.
///
/// Layout: `<plugins_dir>/.state/<sanitized-vault>/<plugin_id>.json`. The vault
/// path is sanitized (separators replaced with `_`) so a nested vault path maps
/// to a single flat state directory. If no plugins dir was captured (no load
/// happened yet) the file lives under a `.loreweaver-plugin-state` temp dir.
fn plugin_state_file(vault_path: &str, plugin_id: &str) -> std::path::PathBuf {
    let sanitized_vault: String = vault_path
        .chars()
        .map(|c| {
            if c == '/' || c == '\\' || c == ':' {
                '_'
            } else {
                c
            }
        })
        .collect();
    let base = {
        let dir = plugins_dir().lock().unwrap_or_else(|e| e.into_inner());
        if dir.is_empty() {
            std::env::temp_dir().join(".loreweaver-plugin-state")
        } else {
            std::path::PathBuf::from(dir.clone())
        }
    };
    base.join(".state")
        .join(sanitized_vault)
        .join(format!("{}.json", plugin_id))
}

/// Maximum allowed size for a single plugin entry script (1 MiB).
const MAX_SCRIPT_SIZE: usize = 1024 * 1024;

/// Loop iteration cap per execution context — guards against infinite loops.
const LOOP_ITERATION_LIMIT: u64 = 50_000;

/// Recursion depth cap — tightened from Boa's 512 default to bound deep recursion.
const RECURSION_LIMIT: usize = 256;

/// VM stack size cap — tightened from Boa's 1024 default to bound stack growth.
const STACK_SIZE_LIMIT: usize = 512;

/// Applies the plugin sandbox's resource limits to a fresh Boa context.
///
/// Boa 0.19 exposes loop-iteration, recursion, and stack-size limits but no
/// heap-memory cap; unbounded allocation is bounded only by process memory
/// (see the module docs and CONCERNS.md for the accepted risk).
fn apply_runtime_limits(context: &mut Context) {
    let limits = context.runtime_limits_mut();
    limits.set_loop_iteration_limit(LOOP_ITERATION_LIMIT);
    limits.set_recursion_limit(RECURSION_LIMIT);
    limits.set_stack_size_limit(STACK_SIZE_LIMIT);
}

/// Scans the specified plugins directory, loading and validating all plugins.
///
/// Discovery & Ingestion Steps:
/// 1. Iterates subdirectories in `plugins_dir_str`.
/// 2. Reads `manifest.json` and parses metadata via `load_single_plugin`.
/// 3. Performs a dry-run JS compilation in a throwaway Boa `Context` (with a 50,000 loop iteration cap).
/// 4. Registers validated plugins into global `ACTIVE_PLUGINS` and initializes vault state in `PLUGIN_STATES`.
pub fn load_all_plugins(
    vault_path: &str,
    plugins_dir_str: &str,
) -> Result<Vec<PluginInfo>, String> {
    let plugins_dir_path = Path::new(plugins_dir_str);
    if !plugins_dir_path.exists() {
        fs::create_dir_all(plugins_dir_path).map_err(|e| e.to_string())?;
    }

    let mut loaded_plugins = Vec::new();
    let mut active_plugins_guard = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
    active_plugins_guard.clear();

    {
        let mut dir_guard = plugins_dir().lock().unwrap_or_else(|e| e.into_inner());
        *dir_guard = plugins_dir_str.to_string();
    }

    let mut states_guard = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
    states_guard.entry(vault_path.to_string()).or_default();

    for entry in fs::read_dir(plugins_dir_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            let manifest_path = path.join("manifest.json");
            if manifest_path.exists() {
                match load_single_plugin(&path, &manifest_path) {
                    Ok(info) => {
                        // Validate the script compiles by evaluating it in a throwaway context.
                        // If it fails, the error will surface again at hook execution time.
                        // We don't persist the context — run_plugin_hook creates a fresh one.
                        {
                            let mut context = Context::default();
                            apply_runtime_limits(&mut context);
                            let source = Source::from_bytes(info.script_content.as_bytes());
                            if let Err(e) = context.eval(source) {
                                eprintln!("JS Eval Error for plugin {}: {:?}", info.id, e);
                                continue;
                            }
                        }

                        active_plugins_guard.insert(info.id.clone(), info.clone());
                        // Restore persisted state from disk (survives restarts), falling
                        // back to an empty object when no state file exists yet.
                        let persisted_state =
                            fs::read_to_string(plugin_state_file(vault_path, &info.id))
                                .unwrap_or_else(|_| "{}".to_string());
                        states_guard
                            .entry(vault_path.to_string())
                            .or_default()
                            .entry(info.id.clone())
                            .or_insert(persisted_state);
                        loaded_plugins.push(info);
                    }
                    Err(e) => eprintln!("Failed to load plugin at {:?}: {}", path, e),
                }
            }
        }
    }

    Ok(loaded_plugins)
}

/// Reads a single plugin directory manifest and entry script.
/// Validates permissions and checks script content length against `MAX_SCRIPT_SIZE`.
fn load_single_plugin(plugin_dir: &Path, manifest_path: &Path) -> Result<PluginInfo, String> {
    let manifest_str = fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let manifest_json: serde_json::Value =
        serde_json::from_str(&manifest_str).map_err(|e| e.to_string())?;

    let id = manifest_json["id"]
        .as_str()
        .ok_or("Missing 'id'")?
        .to_string();
    let name = manifest_json["name"]
        .as_str()
        .ok_or("Missing 'name'")?
        .to_string();
    let version = manifest_json["version"]
        .as_str()
        .unwrap_or("1.0.0")
        .to_string();
    let description = manifest_json["description"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let entry_file = manifest_json["entry"].as_str().unwrap_or("index.js");
    let permissions = manifest_json["permissions"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec!["hooks".to_string()]);

    validate_permissions(&permissions)?;

    let ui_panels = if permissions.iter().any(|p| p == "ui") {
        parse_ui_panels(&manifest_json)?
    } else {
        Vec::new()
    };

    let entry_path = plugin_dir.join(entry_file);
    if !entry_path.exists() {
        return Err(format!("Entry file '{}' not found", entry_file));
    }

    let script_content = fs::read_to_string(entry_path).map_err(|e| e.to_string())?;

    if script_content.len() > MAX_SCRIPT_SIZE {
        return Err(format!(
            "Plugin script exceeds maximum size of {} bytes (got {} bytes)",
            MAX_SCRIPT_SIZE,
            script_content.len()
        ));
    }

    Ok(PluginInfo {
        id,
        name,
        version,
        description,
        permissions,
        script_content,
        active: true,
        ui_panels,
    })
}

/// The closed set of field types a plugin `ui` panel may declare.
const ALLOWED_FIELD_TYPES: [&str; 4] = ["text", "textarea", "select", "number"];

/// Parses and validates the `ui.panels` section of a plugin manifest.
///
/// Returns an empty vector when the manifest declares no `ui` section (or the
/// plugin lacks the `ui` permission — see the caller). Panels are validated
/// structurally: unknown field types, missing action hooks, and colliding panel
/// ids are all rejected so a malformed panel never reaches the host renderer.
fn parse_ui_panels(manifest: &serde_json::Value) -> Result<Vec<UiPanel>, String> {
    let panels_json = match manifest.get("ui").and_then(|ui| ui.get("panels")) {
        Some(serde_json::Value::Array(panels)) => panels,
        _ => return Ok(Vec::new()),
    };

    let mut panels: Vec<UiPanel> = Vec::with_capacity(panels_json.len());
    let mut seen_ids = std::collections::HashSet::new();

    for panel_json in panels_json {
        let id = panel_json
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("ui panel is missing a non-empty 'id'")?
            .to_string();
        if !seen_ids.insert(id.clone()) {
            return Err(format!("duplicate ui panel id: {}", id));
        }
        let title = panel_json
            .get("title")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| id.clone());

        let fields = parse_ui_fields(panel_json.get("fields"))?;
        let actions = parse_ui_actions(panel_json.get("actions"))?;

        panels.push(UiPanel {
            id,
            title,
            fields,
            actions,
        });
    }

    Ok(panels)
}

/// Parses a panel's `fields` array, rejecting unknown field types.
fn parse_ui_fields(fields_json: Option<&serde_json::Value>) -> Result<Vec<UiField>, String> {
    let Some(serde_json::Value::Array(fields)) = fields_json else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(fields.len());
    for field in fields {
        let key = field
            .get("key")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("ui field is missing a non-empty 'key'")?
            .to_string();
        let field_type = field
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or(format!("ui field '{}' is missing a 'type'", key))?
            .to_string();
        if !ALLOWED_FIELD_TYPES.contains(&field_type.as_str()) {
            return Err(format!(
                "ui field '{}' has unknown type '{}' (allowed: {})",
                key,
                field_type,
                ALLOWED_FIELD_TYPES.join(", ")
            ));
        }
        let label = field
            .get("label")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| key.clone());
        let options = field
            .get("options")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        out.push(UiField {
            key,
            field_type,
            label,
            options,
        });
    }
    Ok(out)
}

/// Parses a panel's `actions` array, requiring each action to name a hook.
fn parse_ui_actions(actions_json: Option<&serde_json::Value>) -> Result<Vec<UiAction>, String> {
    let Some(serde_json::Value::Array(actions)) = actions_json else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(actions.len());
    for action in actions {
        let id = action
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("ui action is missing a non-empty 'id'")?
            .to_string();
        let label = action
            .get("label")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| id.clone());
        let hook = action
            .get("hook")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or(format!("ui action '{}' is missing a 'hook'", id))?
            .to_string();
        out.push(UiAction { id, label, hook });
    }
    Ok(out)
}

/// Recursively converts a `serde_json::Value` into a native Boa `JsValue`.
///
/// This avoids serializing state into a JavaScript source string (which would allow
/// injection of arbitrary code) and instead constructs arrays, objects, strings,
/// numbers, booleans, and null values through Boa's native Rust API.
fn json_to_js_value(value: &serde_json::Value, context: &mut Context) -> JsValue {
    match value {
        serde_json::Value::Null => JsValue::null(),
        serde_json::Value::Bool(b) => JsValue::from(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                JsValue::from(i)
            } else if let Some(u) = n.as_u64() {
                JsValue::from(u)
            } else {
                JsValue::from(n.as_f64().unwrap_or(f64::NAN))
            }
        }
        serde_json::Value::String(s) => JsValue::from(js_string!(s.clone())),
        serde_json::Value::Array(arr) => {
            // Build the list of converted elements first so we do not borrow `context`
            // mutably inside the iterator passed to `JsArray::from_iter`.
            let elements: Vec<JsValue> = arr.iter().map(|v| json_to_js_value(v, context)).collect();
            let js_array = JsArray::from_iter(elements, context);
            JsValue::from(js_array)
        }
        serde_json::Value::Object(map) => {
            let js_object = JsObject::with_object_proto(context.intrinsics());
            for (key, val) in map.iter() {
                // JSON object keys are always strings; treat them as such. Numeric-looking
                // keys from `serde_json` preserve their string identity, matching JSON semantics.
                let property_key: PropertyKey = js_string!(key.clone()).into();
                let value_js = json_to_js_value(val, context);
                js_object
                    .create_data_property_or_throw(property_key, value_js, context)
                    .expect("creating a data property on a fresh object must succeed");
            }
            JsValue::from(js_object)
        }
    }
}

/// Executes a plugin hook callback function inside an isolated Boa JavaScript runtime environment.
///
/// ### Execution Security & Lifecycle
/// 1. **Permission Guard**: Verifies the plugin is registered and holds the `"hooks"` permission.
/// 2. **Payload Safety Guard**: Enforces a 32 KiB cap on incoming `payload` text.
/// 3. **Hook Name Sanitization**: Rejects non-alphanumeric/underscore hook names to prevent injection.
/// 4. **State Hydration**: Retrieves JSON state for `(vault_path, plugin_id)` and sets `globalThis.__state`
///    via native Boa value construction (no string interpolation / `eval`).
/// 5. **Context Setup**: Configures a fresh Boa `Context` with loop-iteration, recursion,
///    and stack-size limits via `apply_runtime_limits`.
/// 6. **Function Calling**: Evaluates the script, extracts the target hook function, and calls it with `payload`.
///    The call runs synchronously on the current thread; Boa's `Context` is not `Send`, so a scoped
///    thread timeout cannot borrow it, and Boa 0.19 exposes only loop-iteration and recursion limits.
/// 7. **State Persistence**: Serializes `globalThis.__state` back to string via `JSON.stringify` and saves it in `PLUGIN_STATES`.
/// 8. **Output Return**: Returns the string result returned by the JavaScript hook call.
pub fn run_plugin_hook(
    vault_path: &str,
    plugin_id: &str,
    hook: &str,
    payload: &str,
) -> Result<String, String> {
    let plugin = {
        let active_plugins = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
        active_plugins
            .get(plugin_id)
            .cloned()
            .ok_or(format!("Plugin {} not active", plugin_id))?
    };

    if !has_permission(&plugin, "hooks") {
        return Err(format!(
            "Plugin {} does not declare hook execution permission",
            plugin_id
        ));
    }

    if payload.len() > 32 * 1024 {
        return Err("Plugin payload exceeds 32 KiB limit".to_string());
    }

    if !hook.chars().all(|c| c == '_' || c.is_ascii_alphanumeric()) {
        return Err(format!("Invalid hook name: {}", hook));
    }

    let state_json = {
        let states = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
        states
            .get(vault_path)
            .and_then(|vault_states| vault_states.get(plugin_id))
            .cloned()
            .unwrap_or_else(|| "{}".to_string())
    };

    // Boa's `Context` is not `Send` (it contains `Rc`-based internals), so it cannot be
    // moved across a thread boundary. To enforce a wall-clock timeout we spawn a thread
    // that OWNS the Context and performs the full eval + call + state extraction, then
    // returns only the `String` result (which is `Send`) over a channel. The caller waits
    // on the channel with `recv_timeout`; if the plugin exceeds the budget, the thread is
    // abandoned (it will be torn down when the process exits) and we return a timeout error.
    //
    // This complements the existing 50,000 loop-iteration cap, which guards against
    // infinite loops but not against long-running-but-finite work.
    const HOOK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

    let script_content = plugin.script_content.clone();
    let hook_owned = hook.to_string();
    let payload_owned = payload.to_string();
    let state_json_owned = state_json.clone();
    let vault_path_owned = vault_path.to_string();
    let plugin_id_owned = plugin_id.to_string();

    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();

    std::thread::spawn(move || {
        let result = execute_hook_in_context(
            &script_content,
            &hook_owned,
            &payload_owned,
            &state_json_owned,
        );
        // Persist updated state regardless of hook success/failure.
        if let Ok((response, new_state)) = &result {
            let mut states = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
            states
                .entry(vault_path_owned.clone())
                .or_default()
                .insert(plugin_id_owned.clone(), new_state.clone());
            // Best-effort on-disk persistence so state survives restarts. A write
            // failure must never fail the hook itself — log and move on.
            let state_file = plugin_state_file(&vault_path_owned, &plugin_id_owned);
            if let Some(parent) = state_file.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    eprintln!("Failed to create plugin state dir {:?}: {}", parent, e);
                } else if let Err(e) = fs::write(&state_file, new_state) {
                    eprintln!(
                        "Failed to persist plugin state for {}: {}",
                        plugin_id_owned, e
                    );
                }
            }
            let _ = tx.send(Ok(response.clone()));
        } else if let Err(e) = &result {
            let _ = tx.send(Err(e.clone()));
        }
    });

    match rx.recv_timeout(HOOK_TIMEOUT) {
        Ok(res) => res,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "Plugin hook '{}' timed out after {:?}",
            hook, HOOK_TIMEOUT
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(format!(
            "Plugin hook '{}' thread terminated unexpectedly",
            hook
        )),
    }
}

/// Executes a plugin hook inside a fresh Boa context owned by the calling thread.
///
/// Returns `(response, updated_state)` where `response` is the hook's raw string
/// result (preserving the original contract) and `updated_state` is the serialized
/// `globalThis.__state` after the call. This function is called from a dedicated
/// thread so a wall-clock timeout can be enforced by the caller.
fn execute_hook_in_context(
    script_content: &str,
    hook: &str,
    payload: &str,
    state_json: &str,
) -> Result<(String, String), String> {
    let mut context = Context::default();
    apply_runtime_limits(&mut context);

    // Evaluate plugin script
    let source = Source::from_bytes(script_content.as_bytes());
    context
        .eval(source)
        .map_err(|e| format!("JS Eval Error: {:?}", e))?;

    // Inject state safely — parse as JSON value and set on globalThis using native Boa
    // values instead of string-interpolating raw JSON into eval (which allows code injection).
    let state_value: serde_json::Value =
        serde_json::from_str(state_json).unwrap_or_else(|_| serde_json::json!({}));
    let state_js = json_to_js_value(&state_value, &mut context);
    let global_obj = context.global_object();
    global_obj
        .set(js_string!("__state"), state_js, false, &mut context)
        .map_err(|e| format!("Failed to set plugin state: {:?}", e))?;

    // Retrieve hook function
    let hook_val = global_obj
        .get(js_string!(hook), &mut context)
        .map_err(|e| format!("Failed to find function '{}': {:?}", hook, e))?;

    if !hook_val.is_callable() {
        return Err(format!("Global function '{}' is not callable", hook));
    }

    let callable = hook_val.as_callable().ok_or("Value is not callable")?;

    // Send payload argument
    let js_payload = JsValue::from(boa_engine::js_string!(payload));

    let result = callable
        .call(&JsValue::undefined(), &[js_payload], &mut context)
        .map_err(|e| format!("JS Call Error: {:?}", e))?;

    // Extract updated state
    let mut new_state_str = "{}".to_string();
    if let Ok(new_state_val) =
        context.eval(Source::from_bytes(b"JSON.stringify(globalThis.__state)"))
    {
        if let Some(js_str) = new_state_val.as_string() {
            if let Ok(std_str) = js_str.to_std_string() {
                new_state_str = std_str;
            }
        }
    }

    // Return response (raw string, preserving the original contract)
    let response = match result.as_string() {
        Some(js_str) => js_str
            .to_std_string()
            .map_err(|e| format!("Utf16 Error: {:?}", e))?,
        None => "null".to_string(),
    };

    Ok((response, new_state_str))
}

/// Scaffolds a new, publishable plugin skeleton into the plugins directory.
///
/// Creates `<plugins_dir>/<id>/` containing a valid `manifest.json` and a
/// starter `index.js` with a commented `on_dice_roll` hook. The id is
/// normalised to lowercase alphanumeric + hyphen (the same character set the
/// manifest loader expects) and the directory is refused if it already exists
/// (no silent overwrite). Returns the absolute path to the new plugin folder.
pub fn scaffold_plugin(plugins_dir_str: &str, id: &str, name: &str) -> Result<String, String> {
    // Normalise the id: lowercase, alphanumeric + hyphen only.
    let normalised: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else if c == '-' || c == '_' {
                '-'
            } else {
                '-'
            }
        })
        .collect();
    let normalised = normalised.trim_matches('-').to_string();
    if normalised.is_empty() {
        return Err("Plugin id must contain at least one alphanumeric character".to_string());
    }

    let plugins_dir = Path::new(plugins_dir_str);
    fs::create_dir_all(plugins_dir).map_err(|e| e.to_string())?;
    let plugin_dir = plugins_dir.join(&normalised);
    if plugin_dir.exists() {
        return Err(format!(
            "Plugin '{}' already exists at {}",
            normalised,
            plugin_dir.display()
        ));
    }
    fs::create_dir_all(&plugin_dir).map_err(|e| e.to_string())?;

    let display_name = if name.trim().is_empty() {
        normalised.clone()
    } else {
        name.trim().to_string()
    };

    let manifest = serde_json::json!({
        "id": normalised,
        "name": display_name,
        "version": "1.0.0",
        "description": "Describe what this plugin does.",
        "entry": "index.js",
        "permissions": ["hooks"]
    });
    fs::write(
        plugin_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let index_js = r#"// Loreweaver plugin — starter skeleton.
// Hooks are global functions called by the event bus. Each receives a string
// payload (JSON) and returns a string. State persists across calls via __state.
//
// Available events (see docs/developer/PLUGIN_AUTHORING.md):
//   on_dice_roll, on_note_saved, on_image_generated, on_world_state_changed,
//   plus any schedule.yaml emit_event names.

function on_dice_roll(payload) {
    let roll = JSON.parse(payload); // { expression, rolls, total }
    __state.rolls = __state.rolls || [];
    __state.rolls.push(roll.total);
    return "logged roll: " + roll.total;
}
"#;
    fs::write(plugin_dir.join("index.js"), index_js).map_err(|e| e.to_string())?;

    Ok(plugin_dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn register_test_plugin(plugin_id: &str, script_content: &str, permissions: Vec<String>) {
        let plugin = PluginInfo {
            id: plugin_id.to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            description: "A testing plugin".to_string(),
            permissions,
            script_content: script_content.to_string(),
            active: true,
            ui_panels: vec![],
        };

        let mut active = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
        active.insert(plugin_id.to_string(), plugin);
    }

    #[test]
    fn test_plugin_hook_execution() {
        // Serialize against other tests mutating the process-global plugin registries.
        let _guard = plugin_test_guard();
        let plugin_id = "test-plugin";
        let script = r#"
            function on_dice_roll(payload) {
                let roll = JSON.parse(payload);
                roll.value += 2;
                __state.counter = (__state.counter || 0) + 1;
                return JSON.stringify(roll);
            }
        "#;

        let plugin = PluginInfo {
            id: plugin_id.to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            description: "A testing plugin".to_string(),
            permissions: vec!["hooks".to_string()],
            script_content: script.to_string(),
            active: true,
            ui_panels: vec![],
        };

        // Insert into ACTIVE_PLUGINS global state
        {
            let mut active = active_plugins().lock().unwrap();
            active.insert(plugin_id.to_string(), plugin);
        }

        let vault_path = "/mock/vault";
        let payload = r#"{"value": 10}"#;

        // Run hook first time
        let res = run_plugin_hook(vault_path, plugin_id, "on_dice_roll", payload).unwrap();
        assert_eq!(res, r#"{"value":12}"#);

        // Verify state is updated (counter should be 1)
        {
            let states = plugin_states().lock().unwrap();
            let vault_states = states.get(vault_path).unwrap();
            let state_str = vault_states.get(plugin_id).unwrap();
            assert_eq!(state_str, r#"{"counter":1}"#);
        }

        // Run hook second time (counter should increment to 2)
        let _ = run_plugin_hook(vault_path, plugin_id, "on_dice_roll", payload).unwrap();
        {
            let states = plugin_states().lock().unwrap();
            let vault_states = states.get(vault_path).unwrap();
            let state_str = vault_states.get(plugin_id).unwrap();
            assert_eq!(state_str, r#"{"counter":2}"#);
        }
    }

    #[test]
    fn test_plugin_state_injection_cannot_break_out() {
        let _guard = plugin_test_guard();
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
        let _guard = plugin_test_guard();
        let script = r#"
            function on_loop(payload) {
                while (true) {}
            }
        "#;
        register_test_plugin("loop-test", script, vec!["hooks".to_string()]);
        let start = std::time::Instant::now();
        let result = run_plugin_hook("/tmp/vault", "loop-test", "on_loop", "{}");
        assert!(result.is_err());
        assert!(
            start.elapsed() < std::time::Duration::from_secs(2),
            "must timeout quickly"
        );
    }

    #[test]
    fn test_plugin_recursion_limit_fires() {
        let _guard = plugin_test_guard();
        // Deep recursion must be rejected by the explicit recursion limit rather
        // than exhausting the native stack. 10,000 frames is far beyond the 256 cap.
        let script = r#"
            function on_rec(payload) {
                function dive(n) { return n <= 0 ? 0 : dive(n - 1); }
                return String(dive(10000));
            }
        "#;
        register_test_plugin("recursion-test", script, vec!["hooks".to_string()]);
        let result = run_plugin_hook("/tmp/vault", "recursion-test", "on_rec", "{}");
        assert!(
            result.is_err(),
            "deep recursion should be rejected by the recursion limit, got: {:?}",
            result
        );
    }

    #[test]
    fn test_scaffold_plugin_creates_publishable_skeleton() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");

        let path = scaffold_plugin(plugins_dir.to_str().unwrap(), "My Cool Roller", "My Cool Roller")
            .expect("scaffold should succeed");
        let plugin_dir = std::path::Path::new(&path);

        // Manifest is valid and loadable.
        let manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(plugin_dir.join("manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["id"], "my-cool-roller");
        assert_eq!(manifest["name"], "My Cool Roller");
        assert_eq!(manifest["permissions"][0], "hooks");

        // The skeleton loads cleanly through the real loader (dry-run compile).
        let loaded = load_all_plugins("/tmp/vault", plugins_dir.to_str().unwrap()).unwrap();
        assert_eq!(loaded.len(), 1, "scaffolded plugin should load");
        assert_eq!(loaded[0].id, "my-cool-roller");
        assert!(loaded[0].script_content.contains("on_dice_roll"));

        // Refusing to overwrite an existing plugin.
        let dup = scaffold_plugin(plugins_dir.to_str().unwrap(), "my-cool-roller", "Dup");
        assert!(dup.is_err(), "duplicate scaffold must be refused");
    }

    #[test]
    fn test_unslop_plugin_humanizes_campaign_lore() {
        let _guard = plugin_test_guard();
        let unslop_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("plugins/unslop");
        assert!(unslop_dir.join("manifest.json").exists(), "unslop manifest must exist");
        assert!(unslop_dir.join("index.js").exists(), "unslop index.js must exist");

        let script = fs::read_to_string(unslop_dir.join("index.js")).unwrap();
        register_test_plugin("unslop", &script, vec!["hooks".to_string()]);

        let input_text = "It's important to note that this fortress is a testament to the rich tapestry of the realm. The heroes delve into [[Shadow keep]] to find the lost sword.";
        let res = run_plugin_hook("/tmp/vault", "unslop", "humanize_prose", input_text)
            .expect("hook execution should succeed");

        let parsed: serde_json::Value = serde_json::from_str(&res).unwrap();
        let cleaned = parsed["cleaned_text"].as_str().unwrap();

        // AI clichés stripped or replaced
        assert!(!cleaned.contains("It's important to note that"), "hedging must be stripped");
        assert!(!cleaned.contains("a testament to"), "stock praise must be transformed");
        assert!(!cleaned.contains("rich tapestry of"), "stock metaphor must be transformed");
        assert!(!cleaned.contains("delve into"), "delve must be transformed");

        // Wiki-link and key nouns preserved
        assert!(cleaned.contains("[[Shadow keep]]"), "wiki link must be preserved byte-exact");
        assert!(cleaned.contains("heroes"), "context nouns must be preserved");

        // Replacements count tracked
        assert!(parsed["replacements_count"].as_i64().unwrap() >= 4);

        // Test clean_note hook
        let note_payload = serde_json::json!({
            "title": "Ancient Lore",
            "content": "Certainly! Nestled in the heart of the valley, this beacon of hope stands strong."
        }).to_string();

        let note_res = run_plugin_hook("/tmp/vault", "unslop", "clean_note", &note_payload)
            .expect("clean_note should succeed");
        let note_parsed: serde_json::Value = serde_json::from_str(&note_res).unwrap();
        let note_cleaned = note_parsed["content"].as_str().unwrap();

        assert!(!note_cleaned.starts_with("Certainly!"), "sycophancy must be stripped");
        assert!(!note_cleaned.contains("beacon of hope"), "cliche must be transformed");
    }

    #[test]
    fn test_permission_allow_list_ui_and_media() {
        // `ui` accepted, `media` accepted, `hooks` still accepted.
        assert!(validate_permissions(&["ui".to_string()]).is_ok());
        assert!(validate_permissions(&["media".to_string()]).is_ok());
        assert!(validate_permissions(&["hooks".to_string()]).is_ok());
        // Unknown permissions are still rejected.
        assert!(validate_permissions(&["filesystem".to_string()]).is_err());
        assert!(validate_permissions(&["network".to_string()]).is_err());
    }

    fn write_plugin(plugin_dir: &std::path::Path, manifest: &str, script: &str) {
        fs::create_dir_all(plugin_dir).unwrap();
        fs::write(plugin_dir.join("manifest.json"), manifest).unwrap();
        fs::write(plugin_dir.join("index.js"), script).unwrap();
    }

    #[test]
    fn test_ui_manifest_parsing() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("npc-generator");
        write_plugin(
            &plugin_dir,
            r#"{
  "id": "npc-generator",
  "name": "NPC Generator",
  "version": "1.0.0",
  "description": "test",
  "permissions": ["hooks", "ui"],
  "entry": "index.js",
  "ui": {
    "panels": [{
      "id": "npc-panel",
      "title": "NPC Generator",
      "fields": [
        { "key": "faction", "type": "text", "label": "Faction" },
        { "key": "tone", "type": "select", "label": "Tone", "options": ["grim","heroic","comic"] }
      ],
      "actions": [{ "id": "generate", "label": "Generate", "hook": "generate_npc" }]
    }]
  }
}"#,
            "function generate_npc(p){ return '{}'; }",
        );

        let manifest_path = plugin_dir.join("manifest.json");
        let info = load_single_plugin(&plugin_dir, &manifest_path).unwrap();
        assert_eq!(info.ui_panels.len(), 1);
        let panel = &info.ui_panels[0];
        assert_eq!(panel.id, "npc-panel");
        assert_eq!(panel.title, "NPC Generator");
        assert_eq!(panel.fields.len(), 2);
        assert_eq!(panel.fields[0].key, "faction");
        assert_eq!(panel.fields[0].field_type, "text");
        assert_eq!(panel.fields[1].field_type, "select");
        assert_eq!(panel.fields[1].options, vec!["grim", "heroic", "comic"]);
        assert_eq!(panel.actions.len(), 1);
        assert_eq!(panel.actions[0].hook, "generate_npc");
    }

    #[test]
    fn test_ui_unknown_field_type_rejected() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("bad-plugin");
        write_plugin(
            &plugin_dir,
            r#"{
  "id": "bad-plugin",
  "name": "Bad",
  "permissions": ["ui"],
  "entry": "index.js",
  "ui": { "panels": [{ "id": "p", "fields": [{ "key": "x", "type": "html" }] }] }
}"#,
            "",
        );
        let manifest_path = plugin_dir.join("manifest.json");
        let err = load_single_plugin(&plugin_dir, &manifest_path).unwrap_err();
        assert!(err.contains("unknown type"), "got: {}", err);
    }

    #[test]
    fn test_ui_missing_action_hook_rejected() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("bad-action");
        write_plugin(
            &plugin_dir,
            r#"{
  "id": "bad-action",
  "name": "Bad Action",
  "permissions": ["ui"],
  "entry": "index.js",
  "ui": { "panels": [{ "id": "p", "actions": [{ "id": "a", "label": "A" }] }] }
}"#,
            "",
        );
        let manifest_path = plugin_dir.join("manifest.json");
        let err = load_single_plugin(&plugin_dir, &manifest_path).unwrap_err();
        assert!(err.contains("missing a 'hook'"), "got: {}", err);
    }

    #[test]
    fn test_ui_duplicate_panel_id_rejected() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("dup-panel");
        write_plugin(
            &plugin_dir,
            r#"{
  "id": "dup-panel",
  "name": "Dup",
  "permissions": ["ui"],
  "entry": "index.js",
  "ui": { "panels": [{ "id": "p" }, { "id": "p" }] }
}"#,
            "",
        );
        let manifest_path = plugin_dir.join("manifest.json");
        let err = load_single_plugin(&plugin_dir, &manifest_path).unwrap_err();
        assert!(err.contains("duplicate ui panel id"), "got: {}", err);
    }

    #[test]
    fn test_ui_panels_ignored_without_permission() {
        let _guard = plugin_test_guard();
        let tmp = tempfile::tempdir().unwrap();
        let plugin_dir = tmp.path().join("no-ui-perm");
        write_plugin(
            &plugin_dir,
            r#"{
  "id": "no-ui-perm",
  "name": "No UI",
  "permissions": ["hooks"],
  "entry": "index.js",
  "ui": { "panels": [{ "id": "p", "title": "Hidden" }] }
}"#,
            "function f(p){ return '{}'; }",
        );
        let manifest_path = plugin_dir.join("manifest.json");
        let info = load_single_plugin(&plugin_dir, &manifest_path).unwrap();
        assert!(
            info.ui_panels.is_empty(),
            "ui section should be ignored without ui permission"
        );
    }

    #[test]
    fn test_npc_generator_example_loads_and_returns_table() {
        let _guard = plugin_test_guard();
        let npc_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("plugins/npc-generator");
        assert!(npc_dir.join("manifest.json").exists(), "npc-generator manifest must exist");
        assert!(npc_dir.join("index.js").exists(), "npc-generator index.js must exist");

        // The shipped manifest parses to one ui panel whose action names a hook.
        let manifest_path = npc_dir.join("manifest.json");
        let info = load_single_plugin(&npc_dir, &manifest_path).unwrap();
        assert_eq!(info.ui_panels.len(), 1, "npc-generator should declare one panel");
        assert_eq!(info.ui_panels[0].actions[0].hook, "generate_npc");

        // The hook runs and returns a table result.
        let script = fs::read_to_string(npc_dir.join("index.js")).unwrap();
        register_test_plugin("npc-generator", &script, info.permissions.clone());
        let res = run_plugin_hook(
            "/tmp/vault",
            "npc-generator",
            "generate_npc",
            r#"{"faction":"Ironclads","tone":"grim"}"#,
        )
        .expect("generate_npc hook should succeed");

        let parsed: serde_json::Value = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed["type"], "table");
        assert_eq!(parsed["columns"].as_array().unwrap().len(), 3);
        assert_eq!(parsed["rows"].as_array().unwrap().len(), 5);
    }
}

