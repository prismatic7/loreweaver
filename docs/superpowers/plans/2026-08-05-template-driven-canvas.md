# Template-Driven Canvas Actions & Schema Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a vault-local template system that dynamically shapes the note editor properties panel and surfaces context-menu actions for canvas nodes based on game systems.

**Architecture:** Templates are stored as Markdown + YAML frontmatter inside `<vault>/.templates/`. The backend lists them via a new Tauri command, allowing the frontend to dynamically render editing forms and connect canvas nodes to JS plugin rolling/action hooks.

**Tech Stack:** Tauri v2, Rust (gray-matter, serde_json), React, TypeScript.

## Global Constraints
*   All path-access checks must traverse `validate_safe_path` for vault security.
*   Templates must be fully system-agnostic; no game-specific mechanics (like D&D 5e) are hardcoded.
*   Commands must follow the return shape `Result<T, String>`.

---

### Task 1: Backend Template Command & Security permissions

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/permissions/allow-all.toml`

**Interfaces:**
- Produces: `list_templates(state: State<AppState>) -> Result<Vec<TemplateEntry>, String>`

- [ ] **Step 1: Define serialized template entry types in Rust**
  Add the following structures inside `src-tauri/src/lib.rs`:
  ```rust
  #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
  pub struct TemplateProperty {
      pub r#type: String,
      pub default: serde_json::Value,
  }

  #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
  pub struct TemplateAction {
      pub label: String,
      pub hook: String,
      pub plugin: String,
  }

  #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
  pub struct TemplateEntry {
      pub name: String,
      pub properties: std::collections::HashMap<String, TemplateProperty>,
      pub actions: Vec<TemplateAction>,
  }
  ```

- [ ] **Step 2: Add list_templates backend command implementation**
  Add the command function in `src-tauri/src/lib.rs`:
  ```rust
  #[tauri::command]
  fn list_templates(state: tauri::State<AppState>) -> Result<Vec<TemplateEntry>, String> {
      let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
      let templates_dir = std::path::Path::new(&*vault_path_str).join(".templates");
      if !templates_dir.exists() {
          return Ok(Vec::new());
      }

      let mut entries = Vec::new();
      let matter = gray_matter::Matter::<gray_matter::engine::YAML>::new();

      for entry in std::fs::read_dir(templates_dir).map_err(|e| e.to_string())? {
          let entry = entry.map_err(|e| e.to_string())?;
          let path = entry.path();
          if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
              let name = path.file_stem()
                  .unwrap_or_default()
                  .to_string_lossy()
                  .into_owned();

              let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
              let parsed = matter.parse::<std::collections::HashMap<String, serde_json::Value>>(&content);
              if let Ok(parsed_data) = parsed {
                  if let Some(data) = parsed_data.data {
                      // Extract properties
                      let mut properties = std::collections::HashMap::new();
                      if let Some(props_val) = data.get("properties") {
                          if let Some(props_map) = props_val.as_object() {
                              for (k, v) in props_map {
                                  if let Ok(prop) = serde_json::from_value::<TemplateProperty>(v.clone()) {
                                      properties.insert(k.clone(), prop);
                                  }
                              }
                          }
                      }

                      // Extract actions
                      let mut actions = Vec::new();
                      if let Some(actions_val) = data.get("actions") {
                          if let Some(actions_arr) = actions_val.as_array() {
                              for act_val in actions_arr {
                                  if let Ok(act) = serde_json::from_value::<TemplateAction>(act_val.clone()) {
                                      actions.push(act);
                                  }
                              }
                          }
                      }

                      entries.push(TemplateEntry {
                          name,
                          properties,
                          actions,
                      });
                  }
              }
          }
      }
      Ok(entries)
  }
  ```

- [ ] **Step 3: Register the command in the Tauri builder**
  Add `list_templates` to the `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])` call inside `src-tauri/src/lib.rs`.

- [ ] **Step 4: Enable command execution permissions**
  Modify `src-tauri/permissions/allow-all.toml` to append `"list_templates"` to the allowed commands list.

- [ ] **Step 5: Run tests and verify compiling**
  Run: `cargo check`
  Expected: PASS

- [ ] **Step 6: Commit**
  ```bash
  git add src-tauri/src/lib.rs src-tauri/permissions/allow-all.toml
  git commit -m "feat(backend): add list_templates command"
  ```

---

### Task 2: Write Rust Unit Tests for list_templates

**Files:**
- Modify: `src-tauri/src/lib.rs` (append unit test module entry or test block)

- [ ] **Step 1: Write unit test verifying template parsing**
  Add a test inside a testing block in `src-tauri/src/lib.rs` (or inside `watcher.rs`):
  ```rust
  #[cfg(test)]
  mod template_tests {
      use super::*;
      use std::fs;
      use std::io::Write;

      #[test]
      fn test_list_templates_parser() {
          let temp_dir = std::env::temp_dir().join(format!("vault_{}", uuid::Uuid::new_v4()));
          fs::create_dir_all(&temp_dir).unwrap();

          let templates_dir = temp_dir.join(".templates");
          fs::create_dir_all(&templates_dir).unwrap();

          let template_path = templates_dir.join("Character.md");
          let mut file = fs::File::create(&template_path).unwrap();
          write!(file, "---\nname: Character\nproperties:\n  hp: {{ type: \"number\", default: 10 }}\nactions:\n  - label: \"Roll Initiative\"\n    hook: \"roll_initiative\"\n    plugin: \"character-roller\"\n---\n# Character Content").unwrap();

          // Mock app state
          let app_state = AppState {
              vault_path: std::sync::Mutex::new(temp_dir.to_string_lossy().to_string()),
              ..Default::default() // adapt based on existing AppState structure
          };
          // ... call list_templates parsing directly and assert values ...
          let entries = list_templates(tauri::State::new(&app_state)).unwrap();
          assert_eq!(entries.len(), 1);
          assert_eq!(entries[0].name, "Character");
          assert!(entries[0].properties.contains_key("hp"));

          let _ = fs::remove_dir_all(temp_dir);
      }
  }
  ```

- [ ] **Step 2: Run cargo tests to verify correctness**
  Run: `cargo test`
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  git add src-tauri/src/lib.rs
  git commit -m "test(backend): verify template listing parser"
  ```

---

### Task 3: Render Dynamic Frontmatter Form Inputs in Editor

**Files:**
- Modify: `src/components/CampaignVaultView.tsx`

**Interfaces:**
- Consumes: Tauri invoke `"list_templates"`

- [ ] **Step 1: Define frontend TypeScript interfaces**
  Add definition interfaces:
  ```typescript
  interface TemplateProperty {
    type: "number" | "boolean" | "string";
    default: any;
  }

  interface TemplateAction {
    label: string;
    hook: string;
    plugin: string;
  }

  interface TemplateEntry {
    name: string;
    properties: Record<string, TemplateProperty>;
    actions: TemplateAction[];
  }
  ```

- [ ] **Step 2: Load templates in CampaignVaultView**
  Use `useEffect` to trigger Tauri command `list_templates` and store active schemas in local state:
  ```typescript
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((data) => setTemplates(data))
      .catch((err) => console.error("Failed loading templates:", err));
  }, [activeNote]); // Reload when changing notes or vault directory
  ```

- [ ] **Step 3: Modify Metadata details panel**
  Locate where note frontmatter properties are rendered as text fields. Replace with dynamic template fields:
  ```typescript
  const activeTemplate = templates.find(t => t.name.toLowerCase() === (note.frontmatter?.type || "").toLowerCase());
  // Render form controls based on activeTemplate.properties:
  // E.g. number fields, checkbox controls, select inputs, and fall back to raw text for undefined keys.
  ```

- [ ] **Step 4: Run frontend build check**
  Run: `npm run build`
  Expected: SUCCESS

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/CampaignVaultView.tsx
  git commit -m "feat(editor): render dynamic metadata inputs based on template schemas"
  ```

---

### Task 4: Canvas Context Actions Menu & Plugin Trigger Toasts

**Files:**
- Modify: `src/components/FolderCanvas.tsx`

**Interfaces:**
- Consumes: Tauri invoke `"execute_plugin_hook"`
- Consumes: Tauri invoke `"list_templates"`

- [ ] **Step 1: Implement custom right-click handler on Note Nodes**
  Create local context menu state variables:
  ```typescript
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, noteId: string } | null>(null);
  ```
  Add node context menu wrapper and bind actions defined in template matching `note.frontmatter?.type`.

- [ ] **Step 2: Trigger execute_plugin_hook on click**
  Write callback execution handler:
  ```typescript
  const handleActionClick = (action: TemplateAction, note: Note) => {
    invoke<{ verdict?: string }>("execute_plugin_hook", {
      pluginId: action.plugin,
      hook: action.hook,
      payload: JSON.stringify(note),
    })
      .then((res) => {
        // Show result toast
        showToast(res.verdict || "Action executed successfully!");
      })
      .catch((err) => {
        showToast(`Error: ${err.toString()}`);
      });
  };
  ```

- [ ] **Step 3: Render visual Toasts on Canvas**
  Add a modern floating results window in the bottom-right of `FolderCanvas` to render rolling results, action outputs, or alerts.

- [ ] **Step 4: Compile and verify unit test suites**
  Run: `npm run build && npm run test -- --run`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/FolderCanvas.tsx
  git commit -m "feat(canvas): connect template action hooks to context menu and render results toast"
  ```
