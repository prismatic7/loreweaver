//! # JavaScript Plugin Host Architecture (Boa Engine)
//!
//! Loreweaver supports user-defined extensions via JavaScript plugins executed inside an
//! embedded ECMAScript engine powered by [`boa_engine`].
//!
//! ## Architectural Principles
//! 1. **Embedded Synchronous JS Sandbox**: Plugins run strictly within synchronous Boa `Context`s
//!    without access to Node.js / browser APIs or direct file system access.
//! 2. **Strict Permission Allow-List**: Plugins must declare explicit permissions in `manifest.json`.
//!    Currently, only the `"hooks"` permission (`ALLOWED_PERMISSIONS`) is permitted.
//! 3. **Per-Vault State Isolation**: State mutated by plugins (`globalThis.__state`) is serialized
//!    to JSON and isolated per vault path in `PLUGIN_STATES`, preventing cross-vault state leakage.
//! 4. **Resource Constraints & Safety Caps**:
//!    - Maximum script size: 1 MiB (`MAX_SCRIPT_SIZE`).
//!    - Maximum hook payload: 32 KiB.
//!    - Loop iteration limit: 50,000 iterations per execution context to prevent infinite loops.
//! 5. **Safe Injection**: Plugin state is converted from `serde_json::Value` into native Boa values
//!    and set on `globalThis` directly, eliminating code injection through string interpolation.

use boa_engine::{
    js_string,
    object::{builtins::JsArray, JsObject},
    property::PropertyKey,
    value::JsValue,
    Context, Source,
};
use crate::PluginInfo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};



/// Validates requested permissions against the host's strict allow-list.
///
/// Currently, only `"hooks"` is permitted. Any plugin requesting undeclared or unknown
/// permissions will be rejected during discovery.
fn validate_permissions(permissions: &[String]) -> Result<(), String> {
    const ALLOWED_PERMISSIONS: [&str; 1] = ["hooks"];

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

/// Accessor for global active plugins registry.
fn active_plugins() -> &'static Mutex<HashMap<String, PluginInfo>> {
    ACTIVE_PLUGINS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Accessor for global vault-scoped plugin state storage.
fn plugin_states() -> &'static Mutex<HashMap<String, HashMap<String, String>>> {
    PLUGIN_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Maximum allowed size for a single plugin entry script (1 MiB).
const MAX_SCRIPT_SIZE: usize = 1024 * 1024;

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
    let plugins_dir = Path::new(plugins_dir_str);
    if !plugins_dir.exists() {
        fs::create_dir_all(plugins_dir).map_err(|e| e.to_string())?;
    }

    let mut loaded_plugins = Vec::new();
    let mut active_plugins_guard = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
    active_plugins_guard.clear();

    let mut states_guard = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
    states_guard.entry(vault_path.to_string()).or_default();

    for entry in fs::read_dir(plugins_dir).map_err(|e| e.to_string())? {
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
                            context.runtime_limits_mut().set_loop_iteration_limit(50000);
                            let source = Source::from_bytes(info.script_content.as_bytes());
                            if let Err(e) = context.eval(source) {
                                eprintln!("JS Eval Error for plugin {}: {:?}", info.id, e);
                                continue;
                            }
                        }

                        active_plugins_guard.insert(info.id.clone(), info.clone());
                        states_guard
                            .entry(vault_path.to_string())
                            .or_default()
                            .entry(info.id.clone())
                            .or_insert_with(|| "{}".to_string());
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
    })
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
            let elements: Vec<JsValue> = arr
                .iter()
                .map(|v| json_to_js_value(v, context))
                .collect();
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
/// 5. **Context Setup**: Configures a fresh Boa `Context` with a 50,000 loop iteration limit.
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
                .entry(vault_path_owned)
                .or_default()
                .insert(plugin_id_owned, new_state.clone());
            let _ = tx.send(Ok(response.clone()));
        } else if let Err(e) = &result {
            let _ = tx.send(Err(e.clone()));
        }
    });

    match rx.recv_timeout(HOOK_TIMEOUT) {
        Ok(res) => res,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            Err(format!("Plugin hook '{}' timed out after {:?}", hook, HOOK_TIMEOUT))
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err(format!("Plugin hook '{}' thread terminated unexpectedly", hook))
        }
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
    context.runtime_limits_mut().set_loop_iteration_limit(50000);

    // Evaluate plugin script
    let source = Source::from_bytes(script_content.as_bytes());
    context
        .eval(source)
        .map_err(|e| format!("JS Eval Error: {:?}", e))?;

    // Inject state safely — parse as JSON value and set on globalThis using native Boa
    // values instead of string-interpolating raw JSON into eval (which allows code injection).
    let state_value: serde_json::Value = serde_json::from_str(state_json)
        .unwrap_or_else(|_| serde_json::json!({}));
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
        };

        let mut active = active_plugins().lock().unwrap_or_else(|e| e.into_inner());
        active.insert(plugin_id.to_string(), plugin);
    }

    #[test]
    fn test_plugin_hook_execution() {
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
        assert!(
            start.elapsed() < std::time::Duration::from_secs(2),
            "must timeout quickly"
        );
    }
}
