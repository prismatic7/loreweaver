use boa_engine::{value::JsValue, Context, Source};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub script_content: String,
    pub active: bool,
}

fn validate_permissions(permissions: &[String]) -> Result<(), String> {
    const ALLOWED_PERMISSIONS: [&str; 1] = ["hooks"];

    for permission in permissions {
        if !ALLOWED_PERMISSIONS.contains(&permission.as_str()) {
            return Err(format!("Unsupported plugin permission: {}", permission));
        }
    }

    Ok(())
}

fn has_permission(plugin: &PluginInfo, permission: &str) -> bool {
    plugin.permissions.iter().any(|value| value == permission)
}

static ACTIVE_PLUGINS: OnceLock<Mutex<HashMap<String, PluginInfo>>> = OnceLock::new();
static PLUGIN_STATES: OnceLock<Mutex<HashMap<String, HashMap<String, String>>>> = OnceLock::new();

fn active_plugins() -> &'static Mutex<HashMap<String, PluginInfo>> {
    ACTIVE_PLUGINS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn plugin_states() -> &'static Mutex<HashMap<String, HashMap<String, String>>> {
    PLUGIN_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Maximum plugin script size: 1 MiB.
const MAX_SCRIPT_SIZE: usize = 1024 * 1024;

/// Scans the plugins directory and loads all plugin scripts into active memory.
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

/// Executes a hook inside the sandboxed Boa JS context.
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

    let mut context = Context::default();

    // Evaluate plugin script
    let source = Source::from_bytes(plugin.script_content.as_bytes());
    context
        .eval(source)
        .map_err(|e| format!("JS Eval Error: {:?}", e))?;

    // Inject state safely — parse as JSON value and set on globalThis instead of
    // string-interpolating raw JSON into eval (which allows code injection).
    let state_js_value = context
        .eval(Source::from_bytes(
            format!("JSON.parse({:?})", state_json).as_bytes(),
        ))
        .map_err(|e| format!("Failed to parse plugin state JSON: {:?}", e))?;

    let global_obj = context.global_object();
    let _ = global_obj.set(
        boa_engine::js_string!("__state"),
        state_js_value,
        false,
        &mut context,
    );

    // Retrieve hook function
    let hook_val = global_obj
        .get(boa_engine::js_string!(hook), &mut context)
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
    if let Ok(new_state_val) =
        context.eval(Source::from_bytes(b"JSON.stringify(globalThis.__state)"))
    {
        if let Some(new_state_str) = new_state_val.as_string() {
            if let Ok(new_state_std) = new_state_str.to_std_string() {
                let mut states = plugin_states().lock().unwrap_or_else(|e| e.into_inner());
                states
                    .entry(vault_path.to_string())
                    .or_default()
                    .insert(plugin_id.to_string(), new_state_std);
            }
        }
    }

    // Return response
    let response = match result.as_string() {
        Some(js_str) => js_str
            .to_std_string()
            .map_err(|e| format!("Utf16 Error: {:?}", e))?,
        None => "null".to_string(),
    };

    Ok(response)
}
