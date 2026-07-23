use base64::{engine::general_purpose, Engine as _};
use notify::RecommendedWatcher;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Manager, State};

pub mod agent;
pub mod db;
pub mod ingest;
pub mod plugins;
pub mod search;
pub mod watcher;

// --- App State ---

pub struct AppState {
    pub db_path: Mutex<String>,
    pub vault_path: Mutex<String>,
    pub plugins_path: Mutex<String>,
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

// --- Data Structures ---

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CampaignNote {
    pub id: String,
    pub title: String,
    pub path: String,
    pub frontmatter: HashMap<String, Value>,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuleEntry {
    pub id: String,
    pub title: String,
    pub category: String,
    pub source: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub r#type: String, // "note" | "rule"
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub llm_provider: String,
    pub llm_model: String,
    pub llm_api_key: String,
    pub llm_base_url: String,

    pub embed_provider: String,
    pub embed_model: String,
    pub embed_api_key: String,
    pub embed_base_url: String,

    pub image_provider: String,
    pub image_model: String,
    pub image_api_key: String,
    pub image_base_url: String,

    pub tts_provider: String,
    pub tts_api_key: String,
    pub tts_voice: String,

    pub stt_provider: String,
    pub stt_api_key: String,
}

// --- Tauri Commands ---

/// Simple reversible obfuscation for API keys at rest.
/// Not cryptographic security — prevents casual plaintext observation in the DB file.
/// Uses a machine-specific key derived from the user's home directory.
fn obfuscate_key(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let key = machine_key();
    let bytes: Vec<u8> = plaintext
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    general_purpose::STANDARD.encode(&bytes)
}

fn deobfuscate_key(ciphertext: &str) -> String {
    if ciphertext.is_empty() {
        return String::new();
    }
    let key = machine_key();
    match general_purpose::STANDARD.decode(ciphertext) {
        Ok(bytes) => {
            let decoded: Vec<u8> = bytes
                .iter()
                .enumerate()
                .map(|(i, &b)| b ^ key[i % key.len()])
                .collect();
            String::from_utf8(decoded).unwrap_or_default()
        }
        Err(_) => {
            // If decode fails, it might be a legacy plaintext value — return as-is
            ciphertext.to_string()
        }
    }
}

/// Derive a machine-specific key from the user's home directory path.
fn machine_key() -> Vec<u8> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "loreweaver".to_string());
    let seed = format!("loreweaver::{}", home);
    seed.bytes().collect()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Welcome to Loreweaver, {}! Let's build some worlds.", name)
}

/// Load all campaign notes from the local SQLite database.
#[tauri::command]
fn load_notes(state: State<AppState>) -> Result<Vec<CampaignNote>, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    db::load_all_notes(&conn).map_err(|e| e.to_string())
}

fn validate_safe_path(vault_path: &str, note_path: &str) -> Result<std::path::PathBuf, String> {
    let vault = std::path::Path::new(vault_path);
    let target = vault.join(note_path);

    let mut components = std::collections::VecDeque::new();
    for component in target.components() {
        match component {
            std::path::Component::Prefix(..) => {}
            std::path::Component::RootDir => {
                components.clear();
            }
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                components.pop_back();
            }
            std::path::Component::Normal(c) => {
                components.push_back(c);
            }
        }
    }

    let mut normalized = std::path::PathBuf::new();
    if target.is_absolute() {
        normalized.push(std::path::Component::RootDir.as_os_str());
    }

    for c in components {
        normalized.push(c);
    }

    let mut vault_components = std::collections::VecDeque::new();
    for component in vault.components() {
        match component {
            std::path::Component::Prefix(..) => {}
            std::path::Component::RootDir => {
                vault_components.clear();
            }
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                vault_components.pop_back();
            }
            std::path::Component::Normal(c) => {
                vault_components.push_back(c);
            }
        }
    }
    let mut normalized_vault = std::path::PathBuf::new();
    if vault.is_absolute() {
        normalized_vault.push(std::path::Component::RootDir.as_os_str());
    }
    for c in vault_components {
        normalized_vault.push(c);
    }

    if !normalized.starts_with(&normalized_vault) {
        return Err(
            "Security Violation: Attempted directory traversal outside the vault boundary."
                .to_string(),
        );
    }

    Ok(normalized)
}

/// Validates that `path` is inside the current vault's parent (campaigns) directory.
/// Returns the canonicalized path on success.
fn validate_campaigns_path(
    current_vault_path: &str,
    target_path: &str,
) -> Result<std::path::PathBuf, String> {
    let current_vault = std::path::Path::new(current_vault_path);
    let campaigns_dir = current_vault
        .parent()
        .ok_or("Invalid vault path structure: no parent directory")?;

    let target = std::path::Path::new(target_path);
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Target path does not exist or cannot be resolved: {}", e))?;
    let canonical_campaigns = campaigns_dir
        .canonicalize()
        .map_err(|e| format!("Campaigns directory cannot be resolved: {}", e))?;

    if !canonical_target.starts_with(&canonical_campaigns) {
        return Err(
            "Security Violation: Attempted path outside the campaigns directory boundary."
                .to_string(),
        );
    }

    Ok(canonical_target)
}

fn write_note_to_disk(
    file_path: &std::path::Path,
    content: &str,
    frontmatter: &HashMap<String, Value>,
) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file_content = String::new();
    if !frontmatter.is_empty() {
        let yaml_str = serde_yaml::to_string(frontmatter)
            .map_err(|e| format!("Failed to serialize frontmatter to YAML: {}", e))?;
        file_content.push_str("---\n");
        let trimmed_yaml = yaml_str.trim_start_matches("---").trim();
        file_content.push_str(trimmed_yaml);
        file_content.push_str("\n---\n");
    }

    file_content.push_str(content);
    std::fs::write(file_path, file_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Save note directly to disk and upsert into SQLite immediately (the watcher
/// will also fire, but the DB is already current so there's no stale read).
#[tauri::command]
fn save_note(state: State<AppState>, note: CampaignNote) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let file_path = validate_safe_path(&vault_path, &note.path)?;
    write_note_to_disk(&file_path, &note.content, &note.frontmatter)?;

    // Also upsert directly into the DB so load_notes immediately reflects changes
    if let Ok(conn) = db::init_db(&db_path) {
        let _ = db::upsert_note(
            &conn,
            &note.path,
            &note.title,
            &note.content,
            &note.frontmatter,
        );
    }

    Ok(())
}

/// Saves a base64 encoded asset into the note's co-located `_assets` subdirectory.
#[tauri::command]
fn save_note_asset(
    state: State<AppState>,
    note_path: &str,
    filename: &str,
    base64_data: &str,
) -> Result<String, String> {
    use base64::Engine;

    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());

    let note_file_path = validate_safe_path(&vault_path, note_path)?;
    let parent_dir = note_file_path
        .parent()
        .ok_or_else(|| "Invalid note parent directory".to_string())?;

    let assets_dir = parent_dir.join("_assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create _assets directory: {}", e))?;

    let clean_filename = std::path::Path::new(filename)
        .file_name()
        .ok_or_else(|| "Invalid asset filename".to_string())?
        .to_string_lossy();

    let asset_file_path = assets_dir.join(&*clean_filename);

    let bytes = base64::prelude::BASE64_STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;

    std::fs::write(&asset_file_path, bytes)
        .map_err(|e| format!("Failed to write asset file: {}", e))?;

    Ok(format!("_assets/{}", clean_filename))
}

/// Resolves or auto-creates a note from a [[Wiki-link]] target.
#[tauri::command]
fn resolve_wiki_link(state: State<AppState>, target_name: &str) -> Result<CampaignNote, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());

    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 1. Check if note already exists by title or path
    // Escape LIKE wildcards in the target name to prevent wildcard injection
    let escaped_name = target_name
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let existing_note = conn.query_row(
        "SELECT id, path, title, content FROM notes WHERE LOWER(title) = LOWER(?1) OR LOWER(path) LIKE LOWER(?2) ESCAPE '\\'",
        params![target_name, format!("%/{}.md", escaped_name)],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    );

    if let Ok((id, path, title, content)) = existing_note {
        let mut frontmatter = HashMap::new();
        if let Ok(mut meta_stmt) =
            conn.prepare("SELECT meta_key, meta_value FROM note_metadata WHERE note_id = ?1")
        {
            if let Ok(meta_rows) = meta_stmt.query_map(params![id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            }) {
                for meta in meta_rows.flatten() {
                    let val =
                        serde_json::from_str(&meta.1).unwrap_or_else(|_| Value::String(meta.1));
                    frontmatter.insert(meta.0, val);
                }
            }
        }
        return Ok(CampaignNote {
            id,
            title,
            path,
            frontmatter,
            content,
        });
    }

    // 2. Note does not exist: auto-create from default entity template
    let clean_title = target_name.trim();
    // Sanitize filename: replace path separators and illegal chars
    let safe_filename: String = clean_title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let rel_path = format!("Worldbuilding/{}.md", safe_filename);
    let full_path = validate_safe_path(&vault_path, &rel_path)?;

    let mut frontmatter = HashMap::new();
    frontmatter.insert("type".to_string(), Value::String("Lore".to_string()));
    frontmatter.insert(
        "created_at".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
    frontmatter.insert(
        "tags".to_string(),
        Value::Array(vec![Value::String("auto-created".to_string())]),
    );

    let initial_content = format!(
        "# {}\n\n*Auto-created note for [[{}]]*\n",
        clean_title, clean_title
    );

    write_note_to_disk(&full_path, &initial_content, &frontmatter)?;

    // Parse and upsert into SQLite
    let note_id = db::upsert_note(
        &conn,
        &rel_path,
        clean_title,
        &initial_content,
        &frontmatter,
    )
    .map_err(|e| e.to_string())?;

    Ok(CampaignNote {
        id: note_id,
        title: clean_title.to_string(),
        path: rel_path,
        frontmatter,
        content: initial_content,
    })
}

#[tauri::command]
fn trash_note(state: State<AppState>, note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let file_path = validate_safe_path(&vault_path, note_path)?;
    if !file_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Parse existing file to retain content and metadata
    let (_title, content, mut frontmatter) = watcher::parse_markdown_file(&file_path)?;

    // Add trash metadata
    frontmatter.insert(
        "original_path".to_string(),
        Value::String(note_path.to_string()),
    );
    frontmatter.insert(
        "deleted_at".to_string(),
        Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp())),
    );

    let trash_dir = std::path::Path::new(&*vault_path).join(".trash");
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;

    let filename = file_path.file_name().ok_or("Invalid note filename")?;
    let trash_filename = format!("{}_{}", uuid::Uuid::new_v4(), filename.to_string_lossy());
    let trash_file_path = trash_dir.join(&trash_filename);

    // Write to trash
    write_note_to_disk(&trash_file_path, &content, &frontmatter)?;

    // Remove original file
    std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;

    // Also remove from SQLite DB directly
    if let Ok(conn) = db::init_db(&db_path) {
        let _ = db::delete_note_by_path(&conn, note_path);
    }

    Ok(())
}

#[tauri::command]
fn trash_folder(state: State<AppState>, folder_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let dir_path = validate_safe_path(&vault_path, folder_path)?;
    if !dir_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    let trash_dir = std::path::Path::new(&*vault_path).join(".trash");
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;

    // Walk the folder, move each .md file to trash with metadata
    fn move_files_to_trash(
        dir: &std::path::Path,
        vault_path: &std::path::Path,
        trash_dir: &std::path::Path,
    ) -> Result<(), String> {
        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                move_files_to_trash(&path, vault_path, trash_dir)?;
            } else if path.is_file() {
                let rel_path = path
                    .strip_prefix(vault_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                if path.extension().map_or(false, |ext| ext == "md") {
                    let (_title, content, mut frontmatter) = watcher::parse_markdown_file(&path)?;
                    frontmatter.insert("original_path".to_string(), Value::String(rel_path));
                    frontmatter.insert(
                        "deleted_at".to_string(),
                        Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp())),
                    );
                    let filename = path.file_name().ok_or("Invalid filename")?;
                    let trash_filename =
                        format!("{}_{}", uuid::Uuid::new_v4(), filename.to_string_lossy());
                    let trash_file_path = trash_dir.join(&trash_filename);
                    write_note_to_disk(&trash_file_path, &content, &frontmatter)?;
                }
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    if dir_path.is_dir() {
        move_files_to_trash(&dir_path, std::path::Path::new(&*vault_path), &trash_dir)?;
        // Remove the now-empty directory tree
        std::fs::remove_dir_all(&dir_path).map_err(|e| e.to_string())?;
    } else if dir_path.is_file() {
        std::fs::remove_file(&dir_path).map_err(|e| e.to_string())?;
    }

    if let Ok(conn) = db::init_db(&db_path) {
        let pattern = format!("{}/%", folder_path);
        let _ = conn.execute(
            "DELETE FROM notes WHERE path LIKE ?1 OR path = ?2",
            params![pattern, folder_path],
        );
    }

    Ok(())
}

#[tauri::command]
fn restore_note(state: State<AppState>, trash_note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let file_path = validate_safe_path(&vault_path, trash_note_path)?;
    if !file_path.exists() {
        return Err("Trashed note file does not exist".to_string());
    }

    // Parse the trashed note
    let (_title, content, mut frontmatter) = watcher::parse_markdown_file(&file_path)?;

    // Retrieve original path from frontmatter
    let original_path_val = frontmatter.remove("original_path");
    frontmatter.remove("deleted_at");

    let original_rel_path = match original_path_val {
        Some(Value::String(p)) => p,
        _ => {
            // Fallback: restore to Worldbuilding/filename (strip UUID prefix safely)
            let filename = file_path
                .file_name()
                .ok_or("Invalid filename")?
                .to_string_lossy();
            let clean_filename = if filename.len() > 37 && filename.is_char_boundary(37) {
                &filename[37..]
            } else {
                &filename
            };
            format!("Worldbuilding/{}", clean_filename)
        }
    };

    let original_file_path = validate_safe_path(&vault_path, &original_rel_path)?;

    // Write restored note
    write_note_to_disk(&original_file_path, &content, &frontmatter)?;

    // Remove from trash
    std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_trash_notes(state: State<AppState>) -> Result<Vec<CampaignNote>, String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let trash_dir = std::path::Path::new(&*vault_path).join(".trash");
    if !trash_dir.exists() {
        return Ok(Vec::new());
    }

    let mut trashed_notes = Vec::new();
    if let Ok(entries) = std::fs::read_dir(trash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Ok((title, content, frontmatter)) = watcher::parse_markdown_file(&path) {
                    let rel_path = path
                        .strip_prefix(&*vault_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned();
                    let id = format!(
                        "trash-{}",
                        path.file_stem().unwrap_or_default().to_string_lossy()
                    );
                    trashed_notes.push(CampaignNote {
                        id,
                        title,
                        path: rel_path,
                        frontmatter,
                        content,
                    });
                }
            }
        }
    }

    Ok(trashed_notes)
}

#[tauri::command]
fn empty_trash(state: State<AppState>) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let trash_dir = std::path::Path::new(&*vault_path).join(".trash");
    if trash_dir.exists() {
        std::fs::remove_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_trashed_note(state: State<AppState>, trash_note_path: &str) -> Result<(), String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let file_path = validate_safe_path(&vault_path, trash_note_path)?;
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn cleanup_expired_trash(vault_path_str: &str, db_path_str: &str) -> Result<(), String> {
    let conn = db::init_db(db_path_str).map_err(|e| e.to_string())?;
    let retention_days_str = db::get_setting(&conn, "trash_retention_days")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "30".to_string());
    let retention_days: i64 = retention_days_str.parse().unwrap_or(30);

    let trash_dir = std::path::Path::new(vault_path_str).join(".trash");
    if !trash_dir.exists() {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    let max_age_seconds = retention_days * 86400;

    if let Ok(entries) = std::fs::read_dir(trash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                if let Ok((_title, _content, frontmatter)) = watcher::parse_markdown_file(&path) {
                    let mut delete_file = false;
                    if let Some(Value::Number(deleted_at_num)) = frontmatter.get("deleted_at") {
                        if let Some(deleted_at) = deleted_at_num.as_i64() {
                            if now - deleted_at > max_age_seconds {
                                delete_file = true;
                            }
                        }
                    } else {
                        if let Ok(metadata) = path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                if let Ok(duration) = modified.elapsed() {
                                    if duration.as_secs() as i64 > max_age_seconds {
                                        delete_file = true;
                                    }
                                }
                            }
                        }
                    }

                    if delete_file {
                        println!("Permanently deleting expired trashed note: {:?}", path);
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }

    Ok(())
}

/// Retrieve the active campaign vault path.
#[tauri::command]
fn get_vault_path(state: State<AppState>) -> String {
    state
        .vault_path
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Load rulebooks from the SQLite database.
#[tauri::command]
fn load_rules(state: State<AppState>) -> Result<Vec<RuleEntry>, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, category, source, content FROM rules")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RuleEntry {
                id: row.get(0)?,
                title: row.get(1)?,
                category: row.get(2)?,
                source: row.get(3)?,
                content: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut rules = Vec::new();
    for r in rows {
        rules.push(r.map_err(|e| e.to_string())?);
    }
    Ok(rules)
}

/// Performs a hybrid local search (SQLite FTS5 + vector search similarity).
#[tauri::command]
fn search_vault(
    state: State<AppState>,
    query: &str,
    category: &str,
) -> Result<Vec<SearchResult>, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    search::hybrid_query(&db_path, query, category)
}

/// Saves (creates or updates) a rule entry to the database.
#[tauri::command]
fn save_rule(state: State<AppState>, rule: RuleEntry) -> Result<String, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    db::upsert_rule(
        &conn,
        &rule.id,
        &rule.title,
        &rule.category,
        &rule.source,
        &rule.content,
    )
    .map_err(|e| e.to_string())?;
    // Re-index vector chunks for the saved rule
    if let Err(e) = db::reindex_rule_chunks(&conn, &rule.id, &rule.content) {
        eprintln!("Failed to re-index rule chunks: {:?}", e);
    }
    Ok(rule.id)
}

/// Deletes a rule entry from the database by id.
#[tauri::command]
fn delete_rule(state: State<AppState>, rule_id: &str) -> Result<(), String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    db::delete_rule(&conn, rule_id).map_err(|e| e.to_string())
}

/// Ingests a new rulebook/SRD from raw markdown content.
#[tauri::command]
fn ingest_srd_text(
    state: State<AppState>,
    category: &str,
    source: &str,
    content: &str,
) -> Result<(), String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    ingest::ingest_markdown_text(&db_path, content, category, source)
}

/// Orchestrates an AI response using the configured LLM backend.
#[tauri::command]
async fn orchestrate_agent(
    state: State<'_, AppState>,
    prompt: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    active_note_id: Option<&str>,
) -> Result<String, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    agent::generate_response(
        &db_path,
        prompt,
        provider,
        model,
        api_key,
        base_url,
        active_note_id,
    )
}

fn image_data_url_from_bytes(bytes: &[u8]) -> String {
    let encoded = general_purpose::STANDARD.encode(bytes);
    format!("data:image/png;base64,{}", encoded)
}

fn image_bytes_from_response(response: serde_json::Value) -> Result<Vec<u8>, String> {
    if let Some(b64_json) = response["data"][0]["b64_json"].as_str() {
        return general_purpose::STANDARD
            .decode(b64_json)
            .map_err(|e| format!("Failed to decode image payload: {}", e));
    }

    if let Some(url) = response["data"][0]["url"].as_str() {
        let image_response = ureq::get(url)
            .call()
            .map_err(|e| format!("Failed to download generated image: {:?}", e))?;
        let mut reader = image_response.into_reader();
        let mut bytes = Vec::new();
        std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;
        return Ok(bytes);
    }

    if let Some(images) = response["images"].as_array() {
        if let Some(image) = images.first().and_then(|value| value.as_str()) {
            return general_purpose::STANDARD
                .decode(image)
                .map_err(|e| format!("Failed to decode Stable Diffusion image payload: {}", e));
        }
    }

    if let Some(artifacts) = response["artifacts"].as_array() {
        if let Some(image) = artifacts
            .first()
            .and_then(|value| value["base64"].as_str().or(value["base64_data"].as_str()))
        {
            return general_purpose::STANDARD
                .decode(image)
                .map_err(|e| format!("Failed to decode Stability image payload: {}", e));
        }
    }

    Err("Image service returned no usable image payload".to_string())
}

fn generate_comfyui_image(
    prompt: &str,
    style: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<String, String> {
    let base = base_url
        .unwrap_or("http://127.0.0.1:8188")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("ComfyUI base URL is required".to_string());
    }

    let client_id = uuid::Uuid::new_v4().to_string();
    let positive_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let negative_prompt = "blurry, low quality, distorted, watermark, text, extra limbs";
    let checkpoint = if model.trim().is_empty() {
        "stable-diffusion-v1-5.safetensors"
    } else {
        model.trim()
    };

    let workflow = serde_json::json!({
        "3": {
            "inputs": {
                "seed": uuid::Uuid::new_v4().as_u128() as u64,
                "steps": 28,
                "cfg": 7,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1,
                "model": [4, 0],
                "positive": [6, 0],
                "negative": [7, 0],
                "latent_image": [5, 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "4": {
            "inputs": {
                "ckpt_name": checkpoint
            },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "CheckpointLoaderSimple" }
        },
        "5": {
            "inputs": {
                "width": 768,
                "height": 768,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage",
            "_meta": { "title": "EmptyLatentImage" }
        },
        "6": {
            "inputs": {
                "text": positive_prompt,
                "clip": [4, 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIPTextEncode" }
        },
        "7": {
            "inputs": {
                "text": negative_prompt,
                "clip": [4, 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIPTextEncode" }
        },
        "8": {
            "inputs": {
                "samples": [3, 0],
                "vae": [4, 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAEDecode" }
        },
        "9": {
            "inputs": {
                "images": [8, 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "SaveImage" }
        }
    });

    let prompt_body = serde_json::json!({
        "prompt": workflow,
        "client_id": client_id
    });

    let prompt_response = ureq::post(&format!("{}/prompt", base))
        .set("Content-Type", "application/json")
        .send_json(prompt_body)
        .map_err(|e| format!("ComfyUI prompt submission failed: {:?}", e))?;

    let prompt_json: serde_json::Value = prompt_response
        .into_json()
        .map_err(|e| format!("Failed to parse ComfyUI prompt response: {:?}", e))?;
    let prompt_id = prompt_json["prompt_id"]
        .as_str()
        .ok_or("ComfyUI did not return a prompt_id")?;

    let history_url = format!("{}/history/{}", base, prompt_id);
    let mut history_json: Option<serde_json::Value> = None;

    for _ in 0..60 {
        let response = ureq::get(&history_url)
            .call()
            .map_err(|e| format!("ComfyUI history request failed: {:?}", e))?;
        let parsed: serde_json::Value = response
            .into_json()
            .map_err(|e| format!("Failed to parse ComfyUI history response: {:?}", e))?;

        if parsed.get(prompt_id).is_some() {
            history_json = Some(parsed);
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    let history_json = history_json.ok_or("Timed out waiting for ComfyUI image generation")?;
    let images = history_json[prompt_id]["outputs"]["9"]["images"]
        .as_array()
        .ok_or("ComfyUI history response did not include output images")?;
    let image_info = images
        .first()
        .ok_or("ComfyUI returned no generated images")?;

    let filename = image_info["filename"]
        .as_str()
        .ok_or("ComfyUI image filename missing")?;
    let subfolder = image_info["subfolder"].as_str().unwrap_or("");
    let image_type = image_info["type"].as_str().unwrap_or("output");

    let image_url = format!(
        "{}/view?filename={}&subfolder={}&type={}",
        base,
        urlencoding::encode(filename),
        urlencoding::encode(subfolder),
        urlencoding::encode(image_type)
    );

    let image_response = ureq::get(&image_url)
        .call()
        .map_err(|e| format!("Failed to download ComfyUI image: {:?}", e))?;
    let mut reader = image_response.into_reader();
    let mut bytes = Vec::new();
    std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;
    Ok(image_data_url_from_bytes(&bytes))
}

#[allow(dead_code)]
fn generate_local_stable_diffusion(
    prompt: &str,
    style: &str,
    model: &str,
    base_url: Option<&str>,
) -> Result<String, String> {
    let base = base_url
        .unwrap_or("http://127.0.0.1:7860")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("Local Stable Diffusion base URL is required".to_string());
    }

    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let mut body = serde_json::json!({
        "prompt": clean_prompt,
        "negative_prompt": "blurry, low quality, distorted, watermark, text, extra limbs",
        "steps": 28,
        "cfg_scale": 7,
        "width": 768,
        "height": 768,
        "sampler_name": "DPM++ 2M Karras",
        "batch_size": 1,
        "n_iter": 1,
        "send_images": true,
        "save_images": false,
        "override_settings_restore_afterwards": true
    });

    if !model.trim().is_empty() {
        body["override_settings"] = serde_json::json!({
            "sd_model_checkpoint": model.trim()
        });
    }

    let url = format!("{}/sdapi/v1/txt2img", base);
    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Local Stable Diffusion request failed: {:?}", e))?;

    let response_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Stable Diffusion response: {:?}", e))?;
    let image_bytes = image_bytes_from_response(response_json)?;
    Ok(image_data_url_from_bytes(&image_bytes))
}

fn generate_stability_image(
    prompt: &str,
    style: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    let key = api_key
        .filter(|value| !value.trim().is_empty())
        .ok_or("Stability API key is required")?;

    let base = base_url
        .unwrap_or("https://api.stability.ai")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("Stability API base URL is required".to_string());
    }

    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let engine_id = if model.trim().is_empty() {
        "stable-diffusion-xl-1024-v1-0"
    } else {
        model.trim()
    };

    let url = format!("{}/v1/generation/{}/text-to-image", base, engine_id);
    let body = serde_json::json!({
        "text_prompts": [{ "text": clean_prompt }],
        "cfg_scale": 7,
        "clip_guidance_preset": "FAST_BLUE",
        "height": 768,
        "width": 768,
        "samples": 1,
        "steps": 30
    });

    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {}", key.trim()))
        .send_json(body)
        .map_err(|e| format!("Stability image generation request failed: {:?}", e))?;

    let response_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Stability response: {:?}", e))?;
    let image_bytes = image_bytes_from_response(response_json)?;
    Ok(image_data_url_from_bytes(&image_bytes))
}

#[tauri::command]
fn generate_image(
    prompt: &str,
    style: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{} Style: {}.", prompt.trim(), style.trim())
    };

    let image_model = if model.trim().is_empty() {
        "dall-e-3"
    } else {
        model.trim()
    };

    match provider {
        "local" => generate_comfyui_image(prompt, style, image_model, base_url),
        "openai" | "openai-compatible" => {
            let base = base_url
                .unwrap_or("https://api.openai.com")
                .trim()
                .trim_end_matches('/');
            if base.is_empty() {
                return Err("Image provider base URL is required".to_string());
            }

            let url = format!("{}/v1/images/generations", base);
            let body = serde_json::json!({
                "model": image_model,
                "prompt": clean_prompt,
                "size": "1024x1024",
                "response_format": "b64_json"
            });

            let mut request = ureq::post(&url).set("Content-Type", "application/json");
            if let Some(key) = api_key {
                if !key.trim().is_empty() {
                    request = request.set("Authorization", &format!("Bearer {}", key.trim()));
                }
            }

            let response = request
                .send_json(body)
                .map_err(|e| format!("Image generation request failed: {:?}", e))?;

            let response_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse image generation response: {:?}", e))?;
            let image_bytes = image_bytes_from_response(response_json)?;
            Ok(image_data_url_from_bytes(&image_bytes))
        }
        "stability" => generate_stability_image(prompt, style, image_model, api_key, base_url),
        other => Err(format!("Unsupported image provider: {}", other)),
    }
}

/// Generates speech audio from text using the configured TTS provider.
/// Returns a base64-encoded audio data URL suitable for <audio> playback.
#[tauri::command]
fn generate_speech(
    text: &str,
    provider: &str,
    api_key: Option<&str>,
    voice: Option<&str>,
    base_url: Option<&str>,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is required for speech generation".to_string());
    }

    match provider {
        "openai" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("OpenAI TTS API key is required")?;
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("https://api.openai.com")
                .trim()
                .trim_end_matches('/');
            let voice_name = voice.filter(|v| !v.trim().is_empty()).unwrap_or("alloy");

            let url = format!("{}/v1/audio/speech", base);
            let body = serde_json::json!({
                "model": "tts-1",
                "voice": voice_name,
                "input": text,
                "response_format": "mp3",
            });

            let response = ureq::post(&url)
                .timeout(std::time::Duration::from_secs(30))
                .set("Authorization", &format!("Bearer {}", key.trim()))
                .set("Content-Type", "application/json")
                .send_json(body)
                .map_err(|e| format!("OpenAI TTS request failed: {:?}", e))?;

            let mut reader = response.into_reader();
            let mut bytes = Vec::new();
            std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;

            let encoded = general_purpose::STANDARD.encode(&bytes);
            Ok(format!("data:audio/mp3;base64,{}", encoded))
        }
        "elevenlabs" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("ElevenLabs API key is required")?;
            let voice_id = voice.filter(|v| !v.trim().is_empty()).unwrap_or("21m00Tcm4TlvDq8ikWAM");

            let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);
            let body = serde_json::json!({
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 },
            });

            let response = ureq::post(&url)
                .timeout(std::time::Duration::from_secs(30))
                .set("xi-api-key", key.trim())
                .set("Content-Type", "application/json")
                .send_json(body)
                .map_err(|e| format!("ElevenLabs TTS request failed: {:?}", e))?;

            let mut reader = response.into_reader();
            let mut bytes = Vec::new();
            std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;

            let encoded = general_purpose::STANDARD.encode(&bytes);
            Ok(format!("data:audio/mp3;base64,{}", encoded))
        }
        "local" => Err("Local TTS is not yet implemented. Configure an API-based provider (OpenAI or ElevenLabs) in Settings.".to_string()),
        other => Err(format!("Unsupported TTS provider: {}", other)),
    }
}

#[tauri::command]
fn load_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    let llm_provider = db::get_setting(&conn, "llm_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "ollama".to_string());
    let llm_model = db::get_setting(&conn, "llm_model")
        .unwrap_or(None)
        .unwrap_or_else(|| "llama3:8b".to_string());
    let llm_api_key = deobfuscate_key(
        &db::get_setting(&conn, "llm_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
    );
    let llm_base_url = db::get_setting(&conn, "llm_base_url")
        .unwrap_or(None)
        .unwrap_or_else(|| "http://localhost:11434".to_string());

    let embed_provider = db::get_setting(&conn, "embed_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let embed_model = db::get_setting(&conn, "embed_model")
        .unwrap_or(None)
        .unwrap_or_else(|| "all-MiniLM-L6-v2".to_string());
    let embed_api_key = deobfuscate_key(
        &db::get_setting(&conn, "embed_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
    );
    let embed_base_url = db::get_setting(&conn, "embed_base_url")
        .unwrap_or(None)
        .unwrap_or_default();

    let image_provider = db::get_setting(&conn, "image_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let image_model = db::get_setting(&conn, "image_model")
        .unwrap_or(None)
        .unwrap_or_default();
    let image_api_key = deobfuscate_key(
        &db::get_setting(&conn, "image_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
    );
    let image_base_url = db::get_setting(&conn, "image_base_url")
        .unwrap_or(None)
        .unwrap_or_default();

    let tts_provider = db::get_setting(&conn, "tts_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let tts_api_key = deobfuscate_key(
        &db::get_setting(&conn, "tts_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
    );
    let tts_voice = db::get_setting(&conn, "tts_voice")
        .unwrap_or(None)
        .unwrap_or_default();

    let stt_provider = db::get_setting(&conn, "stt_provider")
        .unwrap_or(None)
        .unwrap_or_else(|| "local".to_string());
    let stt_api_key = deobfuscate_key(
        &db::get_setting(&conn, "stt_api_key")
            .unwrap_or(None)
            .unwrap_or_default(),
    );

    Ok(AppSettings {
        llm_provider,
        llm_model,
        llm_api_key,
        llm_base_url,
        embed_provider,
        embed_model,
        embed_api_key,
        embed_base_url,
        image_provider,
        image_model,
        image_api_key,
        image_base_url,
        tts_provider,
        tts_api_key,
        tts_voice,
        stt_provider,
        stt_api_key,
    })
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    let db_path = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    db::set_setting(&conn, "llm_provider", &settings.llm_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_model", &settings.llm_model).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_api_key", &obfuscate_key(&settings.llm_api_key))
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "llm_base_url", &settings.llm_base_url).map_err(|e| e.to_string())?;

    db::set_setting(&conn, "embed_provider", &settings.embed_provider)
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "embed_model", &settings.embed_model).map_err(|e| e.to_string())?;
    db::set_setting(
        &conn,
        "embed_api_key",
        &obfuscate_key(&settings.embed_api_key),
    )
    .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "embed_base_url", &settings.embed_base_url)
        .map_err(|e| e.to_string())?;

    db::set_setting(&conn, "image_provider", &settings.image_provider)
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "image_model", &settings.image_model).map_err(|e| e.to_string())?;
    db::set_setting(
        &conn,
        "image_api_key",
        &obfuscate_key(&settings.image_api_key),
    )
    .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "image_base_url", &settings.image_base_url)
        .map_err(|e| e.to_string())?;

    db::set_setting(&conn, "tts_provider", &settings.tts_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "tts_api_key", &obfuscate_key(&settings.tts_api_key))
        .map_err(|e| e.to_string())?;
    db::set_setting(&conn, "tts_voice", &settings.tts_voice).map_err(|e| e.to_string())?;

    db::set_setting(&conn, "stt_provider", &settings.stt_provider).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "stt_api_key", &obfuscate_key(&settings.stt_api_key))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn test_provider_connection(
    provider: &str,
    base_url: &str,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    let clean_base = base_url.trim().trim_end_matches('/');

    match provider {
        "local" => {
            let url = if clean_base.is_empty() {
                "http://127.0.0.1:8188/object_info"
            } else {
                &format!("{}/object_info", clean_base)
            };

            let response = ureq::get(url)
                .call()
                .map_err(|e| format!("Failed to connect to ComfyUI: {:?}", e))?;

            let _: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse ComfyUI object info: {:?}", e))?;

            Ok(Vec::new())
        }
        "stability" => {
            let url = if clean_base.is_empty() {
                "https://api.stability.ai/v1/engines/list"
            } else {
                &format!("{}/v1/engines/list", clean_base)
            };

            let key = api_key.ok_or("Stability API key is missing")?;
            let response = ureq::get(url)
                .set("Authorization", &format!("Bearer {}", key))
                .call()
                .map_err(|e| format!("Failed to connect to Stability AI: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Stability engine list: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["engines"].as_array() {
                for item in list {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }

            Ok(models)
        }
        "ollama" | "ollama-cloud" => {
            let url = if clean_base.is_empty() {
                "http://localhost:11434/api/tags"
            } else {
                &format!("{}/api/tags", clean_base)
            };

            let response = ureq::get(url)
                .call()
                .map_err(|e| format!("Failed to connect to Ollama: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse response JSON: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["models"].as_array() {
                for item in list {
                    if let Some(name) = item["name"].as_str() {
                        models.push(name.to_string());
                    }
                }
            }
            Ok(models)
        }
        "openai" | "copilot" | "z-ai" | "kilo" | "huggingface" | "openai-compatible"
        | "openrouter" => {
            let default_url = match provider {
                "openrouter" => "https://openrouter.ai/api",
                "copilot" => "https://api.githubcopilot.com",
                "z-ai" => "https://api.z.ai/api",
                "kilo" => "https://api.kilo.ai/api",
                "huggingface" => "https://api-inference.huggingface.co",
                _ => "https://api.openai.com",
            };
            let url = if clean_base.is_empty() {
                &format!("{}/v1/models", default_url)
            } else {
                &format!("{}/v1/models", clean_base)
            };

            let mut request = ureq::get(url);
            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.set("Authorization", &format!("Bearer {}", key));
                }
            }

            let response = request
                .call()
                .map_err(|e| format!("Request failed: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse JSON: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(data) = res_json["data"].as_array() {
                for item in data {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        }
        "gemini" => {
            let key = api_key.ok_or("Gemini API key missing")?;
            let base = if clean_base.is_empty() {
                "https://generativelanguage.googleapis.com"
            } else {
                clean_base
            };
            let url = format!("{}/v1beta/models", base);

            let response = ureq::get(&url)
                .set("x-goog-api-key", key)
                .call()
                .map_err(|e| format!("Failed to connect to Gemini API: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Gemini response: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["models"].as_array() {
                for item in list {
                    if let Some(name) = item["name"].as_str() {
                        let clean_name = name.strip_prefix("models/").unwrap_or(name);
                        models.push(clean_name.to_string());
                    }
                }
            }
            Ok(models)
        }
        "anthropic" => {
            let key = api_key.ok_or("Anthropic API key missing")?;
            let base = if clean_base.is_empty() {
                "https://api.anthropic.com"
            } else {
                clean_base
            };
            let url = format!("{}/v1/models", base);

            let response = ureq::get(&url)
                .set("x-api-key", key)
                .set("anthropic-version", "2023-06-01")
                .call()
                .map_err(|e| format!("Failed to connect to Anthropic API: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Anthropic response: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(data) = res_json["data"].as_array() {
                for item in data {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        }
        _ => Err(format!(
            "Connection test not supported for provider: {}",
            provider
        )),
    }
}

#[tauri::command]
fn list_vaults(state: State<AppState>) -> Result<Vec<HashMap<String, String>>, String> {
    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let current_vault = std::path::Path::new(&*vault_path_str);

    // Resolve the campaigns directory as the canonicalized parent of the vault.
    // This prevents listing arbitrary directories if the vault is not under a
    // campaigns/ folder.
    let campaigns_dir = current_vault
        .parent()
        .ok_or("Invalid vault path structure: no parent directory")?;
    let canonical_campaigns = campaigns_dir
        .canonicalize()
        .map_err(|e| format!("Cannot resolve campaigns directory: {}", e))?;

    let mut list = Vec::new();
    if canonical_campaigns.is_dir() {
        for entry in std::fs::read_dir(&canonical_campaigns).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let mut map = HashMap::new();
                    map.insert("name".to_string(), name.to_string());
                    map.insert("path".to_string(), path.to_string_lossy().to_string());
                    list.push(map);
                }
            }
        }
    }
    Ok(list)
}

#[tauri::command]
fn create_vault(state: State<AppState>, name: &str) -> Result<String, String> {
    let sanitized_name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == ' ')
        .collect();
    let sanitized_name = sanitized_name.trim();
    if sanitized_name.is_empty() {
        return Err("Invalid vault name".to_string());
    }

    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let current_vault = std::path::Path::new(&*vault_path_str);
    let campaigns_dir = current_vault
        .parent()
        .ok_or("Invalid vault path structure")?;
    let new_vault_path = campaigns_dir.join(&sanitized_name);

    if new_vault_path.exists() {
        return Err("A campaign vault with this name already exists".to_string());
    }

    std::fs::create_dir_all(&new_vault_path).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(new_vault_path.join("Worldbuilding")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(new_vault_path.join("Characters")).map_err(|e| e.to_string())?;

    let seed_note_path = new_vault_path.join("Worldbuilding/Eldoria.md");
    std::fs::write(&seed_note_path, r#"---
type: Location
region: Eastern Reaches
ruler: Queen Valerius
safety: Medium
---
# Eldoria

Eldoria is a sprawling kingdom known for its towering white-stone structures and the shimmering River of Stars that flows through its capital."#).map_err(|e| e.to_string())?;

    Ok(new_vault_path.to_string_lossy().to_string())
}

#[tauri::command]
fn switch_vault(state: State<AppState>, path: &str) -> Result<(), String> {
    let current_vault_path = state
        .vault_path
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let canonical_target = validate_campaigns_path(&current_vault_path, path)?;

    if !canonical_target.is_dir() {
        return Err("Target vault path does not exist or is not a directory".to_string());
    }

    {
        let mut watcher_guard = state.watcher.lock().unwrap_or_else(|e| e.into_inner());
        *watcher_guard = None;
    }

    let new_vault_path_str = canonical_target.to_string_lossy().to_string();
    let new_db_path_str = canonical_target
        .join("loreweaver_vault.db")
        .to_string_lossy()
        .to_string();

    {
        let mut vault_path_guard = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
        *vault_path_guard = new_vault_path_str.clone();

        let mut db_path_guard = state.db_path.lock().unwrap_or_else(|e| e.into_inner());
        *db_path_guard = new_db_path_str.clone();
    }

    let conn = db::init_db(&new_db_path_str).map_err(|e| e.to_string())?;
    db::seed_default_rules(&conn).map_err(|e| e.to_string())?;

    let new_watcher =
        watcher::start_directory_watcher(new_vault_path_str.clone(), new_db_path_str.clone())?;
    {
        let mut watcher_guard = state.watcher.lock().unwrap_or_else(|e| e.into_inner());
        *watcher_guard = Some(new_watcher);
    }

    let db_path_clone = new_db_path_str.clone();
    let vault_path_clone = new_vault_path_str.clone();

    let search_engine_dir = canonical_target
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "./data".to_string());

    std::thread::spawn(move || {
        search::set_db_path(&db_path_clone);
        match search::init_search_engine(&search_engine_dir) {
            Ok(_) => {
                let _ = search::index_all_rules_vectors(&db_path_clone);
                let _ = watcher::sync_entire_directory(
                    std::path::Path::new(&vault_path_clone),
                    &db_path_clone,
                );
                let _ = cleanup_expired_trash(&vault_path_clone, &db_path_clone);
                println!("New campaign vault notes vector-indexed successfully!");
            }
            Err(e) => eprintln!("Failed to initialize search engine for new vault: {:?}", e),
        }
    });

    Ok(())
}

#[tauri::command]
fn delete_vault(state: State<AppState>, vault_path: &str) -> Result<(), String> {
    let current_vault_path = state
        .vault_path
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    if current_vault_path == vault_path {
        return Err(
            "Cannot delete the currently active vault. Please switch to another vault first."
                .to_string(),
        );
    }

    let canonical_target = validate_campaigns_path(&current_vault_path, vault_path)?;

    if !canonical_target.is_dir() {
        return Err("Vault directory does not exist".to_string());
    }

    std::fs::remove_dir_all(&canonical_target)
        .map_err(|e| format!("Failed to delete vault directory: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_vault_dialog() -> Result<Option<String>, String> {
    let res = rfd::FileDialog::new()
        .set_title("Select Campaign Vault Directory")
        .pick_folder();

    match res {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct VaultSettings {
    pub name: Option<String>,
    pub campaign_system: Option<String>,
    pub description: Option<String>,
    pub tag_colors: Option<HashMap<String, String>>,
}

#[tauri::command]
fn load_vault_settings(state: State<AppState>) -> Result<VaultSettings, String> {
    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let config_file = std::path::Path::new(&*vault_path_str).join("vault_config.json");
    if !config_file.exists() {
        return Ok(VaultSettings::default());
    }
    let content = std::fs::read_to_string(&config_file).map_err(|e| e.to_string())?;
    let settings: VaultSettings = serde_json::from_str(&content).unwrap_or_default();
    Ok(settings)
}

#[tauri::command]
fn save_vault_settings(state: State<AppState>, settings: VaultSettings) -> Result<(), String> {
    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let config_file = std::path::Path::new(&*vault_path_str).join("vault_config.json");
    let json_str = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&config_file, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_canvas_file(state: State<AppState>, rel_path: &str) -> Result<String, String> {
    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let full_path = validate_safe_path(&vault_path_str, rel_path)?;
    if !full_path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_canvas_file(state: State<AppState>, rel_path: &str, content: &str) -> Result<(), String> {
    let vault_path_str = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    let full_path = validate_safe_path(&vault_path_str, rel_path)?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(full_path, content).map_err(|e| e.to_string())
}

/// Loads all third-party plugins from the configured plugins folder.
#[tauri::command]
fn load_plugins(state: State<'_, AppState>) -> Result<Vec<plugins::PluginInfo>, String> {
    let plugins_path = state.plugins_path.lock().unwrap_or_else(|e| e.into_inner());
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    plugins::load_all_plugins(&vault_path, &plugins_path)
}

/// Executes a callback hook in a specific loaded plugin sandbox.
#[tauri::command]
fn execute_plugin_hook(
    state: State<'_, AppState>,
    plugin_id: &str,
    hook: &str,
    payload: &str,
) -> Result<String, String> {
    let vault_path = state.vault_path.lock().unwrap_or_else(|e| e.into_inner());
    plugins::run_plugin_hook(&vault_path, plugin_id, hook, payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let err = |msg: String| -> Box<dyn std::error::Error> {
                msg.into()
            };

            // Resolve local-first directories
            let app_data_dir = app_handle.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| err(format!("Failed to create app data dir: {}", e)))?;

            let db_path = app_data_dir.join("loreweaver.db").to_string_lossy().to_string();
            let vault_path = app_data_dir.join("campaigns/default").to_string_lossy().to_string();
            let plugins_path = app_data_dir.join("plugins").to_string_lossy().to_string();
            std::fs::create_dir_all(&vault_path)
                .map_err(|e| err(format!("Failed to create vault dir: {}", e)))?;
            std::fs::create_dir_all(&plugins_path)
                .map_err(|e| err(format!("Failed to create plugins dir: {}", e)))?;

            // Seed a sample dice bonus modifier plugin
            let sample_plugin_dir = app_data_dir.join("plugins/dice-bonus");
            std::fs::create_dir_all(&sample_plugin_dir)
                .map_err(|e| err(format!("Failed to create sample plugin dir: {}", e)))?;

            let sample_manifest = sample_plugin_dir.join("manifest.json");
            if !sample_manifest.exists() {
                std::fs::write(&sample_manifest, r#"{
  "id": "dice-bonus",
  "name": "Proficiency Bonus Modifier",
  "version": "1.0.0",
  "description": "Appends a proficiency bonus (+2) to all d20 rolls automatically.",
    "permissions": ["hooks"],
  "entry": "index.js"
}"#).map_err(|e| err(format!("Failed to write sample manifest: {}", e)))?;
            }

            let sample_script = sample_plugin_dir.join("index.js");
            if !sample_script.exists() {
                std::fs::write(&sample_script, r#"function on_dice_roll(payload) {
    let data = JSON.parse(payload);
    if (data.sides === 20) {
        data.modifier += 2;
    }
    return JSON.stringify(data);
}"#).map_err(|e| err(format!("Failed to write sample script: {}", e)))?;
            }

            // Seed sample files if vault is completely empty
            let eldoria_path = app_data_dir.join("campaigns/default/Worldbuilding/Eldoria.md");
            if !eldoria_path.exists() {
                if let Some(parent) = eldoria_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| err(format!("Failed to create sample dir: {}", e)))?;
                }
                std::fs::write(&eldoria_path, r#"---
type: Location
region: Eastern Reaches
ruler: Queen Valerius
safety: Medium
---
# Eldoria

Eldoria is a sprawling kingdom known for its towering white-stone structures and the shimmering River of Stars that flows through its capital.

The city is divided into three major rings:
1. **The Sunlit Spire**: The royal court and administrative sector.
2. **The Canopy District**: A bustling commercial hub suspended on great white arches.
3. **The Shadowed Docks**: The lower slums alongside the River of Stars where contraband changes hands.

## Key Factions
- **The Silver Shield**: A group of paladins dedicated to the protection of the realm.
- **The Shadow Hand**: A clandestine thieves' guild operating in the lower slums."#).map_err(|e| err(format!("Failed to write sample note: {}", e)))?;
            }

            let malakor_path = app_data_dir.join("campaigns/default/Characters/Lord Malakor.md");
            if !malakor_path.exists() {
                if let Some(parent) = malakor_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| err(format!("Failed to create sample dir: {}", e)))?;
                }
                std::fs::write(&malakor_path, r#"---
type: NPC
system: dnd5e
alignment: Lawful Evil
hp: 120
ac: 18
---
# Lord Malakor

Lord Malakor is the ruler of the Shadow Keep, a forbidding fortress built into the side of Mount Obsidian. He seeks to unlock the Obsidian Gate in Eldoria.

## Personality Traits
- **Flaw**: Underestimates the resolve of the common folk.
- **Ideal**: Power. Only the strong deserve to rule."#).map_err(|e| err(format!("Failed to write sample note: {}", e)))?;
            }

            // Init Database and Seed Rules
            let conn = db::init_db(&db_path)
                .map_err(|e| err(format!("Failed to init database: {}", e)))?;
            db::seed_default_rules(&conn)
                .map_err(|e| err(format!("Failed to seed default rules: {}", e)))?;

            // Spawn Fs Watcher (triggers initial index scan automatically)
            let watcher = watcher::start_directory_watcher(vault_path.clone(), db_path.clone())
                .map_err(|e| err(format!("Failed to start directory watcher: {}", e)))?;

            // Spawn local search engine initialization and subsequent vector indexing in a background thread
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string();
            let db_path_clone = db_path.clone();
            let vault_path_clone = vault_path.clone();
            std::thread::spawn(move || {
                search::set_db_path(&db_path_clone);
                match search::init_search_engine(&app_data_dir_str) {
                    Ok(_) => {
                        println!("Search engine loaded. Vector-indexing existing notes and rules...");
                        let _ = search::index_all_rules_vectors(&db_path_clone);
                        let _ = watcher::sync_entire_directory(std::path::Path::new(&vault_path_clone), &db_path_clone);
                        let _ = cleanup_expired_trash(&vault_path_clone, &db_path_clone);
                        println!("Notes and rules successfully vector indexed!");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize search engine: {:?}", e);
                    }
                }
            });

            app.manage(AppState {
                db_path: Mutex::new(db_path),
                vault_path: Mutex::new(vault_path),
                plugins_path: Mutex::new(plugins_path),
                watcher: Mutex::new(Some(watcher)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            load_notes,
            load_trash_notes,
            empty_trash,
            save_note,
            save_note_asset,
            resolve_wiki_link,
            load_rules,
            save_rule,
            delete_rule,
            get_vault_path,
            search_vault,
            ingest_srd_text,
            orchestrate_agent,
            generate_image,
            generate_speech,
            load_plugins,
            execute_plugin_hook,
            load_settings,
            save_settings,
            test_provider_connection,
            list_vaults,
            create_vault,
            switch_vault,
            trash_note,
            trash_folder,
            restore_note,
            delete_trashed_note,
            delete_vault,
            open_vault_dialog,
            load_vault_settings,
            save_vault_settings,
            load_canvas_file,
            save_canvas_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
