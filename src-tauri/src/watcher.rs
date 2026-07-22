use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use gray_matter::{Matter, engine::YAML};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::Value;
use crate::db;

fn clean_title(title: &str) -> String {
    let mut s = title.trim().to_string();

    // Handle markdown links: [Label](loreweaver-note:Target)
    if let Some(link_pos) = s.find("loreweaver-note:") {
        if let Some(idx_close) = s[..link_pos].rfind(']') {
            if let Some(idx_open) = s[..idx_close].rfind('[') {
                let label = &s[idx_open + 1..idx_close];
                if !label.trim().is_empty() {
                    return clean_title(label);
                }
            }
        }
    }

    // Strip brackets and parentheses (handles wiki links or leftover nested symbols)
    while s.starts_with('[') {
        s.remove(0);
    }
    while s.ends_with(']') {
        s.pop();
    }
    while s.ends_with(')') {
        s.pop();
    }

    // Handle wiki link alias: Target|Label
    if let Some(pos) = s.find('|') {
        s = s[pos + 1..].to_string();
    }

    s.trim().to_string()
}

pub fn should_ai_index(path: &Path, frontmatter: &HashMap<String, Value>) -> bool {
    // 1. Check frontmatter toggle (ai_index: false)
    if let Some(val) = frontmatter.get("ai_index") {
        if let Some(b) = val.as_bool() {
            if !b {
                return false;
            }
        } else if let Some(s) = val.as_str() {
            if s == "false" || s == "0" {
                return false;
            }
        }
    }

    // 2. Check for .noai file in parent directories
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir.join(".noai").exists() {
            return false;
        }
        current = dir.parent();
    }

    true
}

/// Parses a Markdown file, extracts YAML frontmatter and H1 title.
pub fn parse_markdown_file(path: &Path) -> Result<(String, String, HashMap<String, Value>), String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let matter = Matter::<YAML>::new();
    let parsed_result = matter.parse::<HashMap<String, Value>>(&content);
    let parsed = parsed_result.map_err(|e| format!("Failed to parse frontmatter: {:?}", e))?;

    let frontmatter: HashMap<String, Value> = parsed.data.unwrap_or_default();

    // Determine note title
    let raw_title = if let Some(Value::String(t)) = frontmatter.get("title") {
        t.clone()
    } else {
        // Fallback: look for H1 heading in markdown
        let first_line = parsed.content.lines().next().unwrap_or("");
        if first_line.starts_with("# ") {
            first_line.trim_start_matches("# ").to_string()
        } else {
            // Fallback: use filename
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        }
    };

    let title = clean_title(&raw_title);

    Ok((title, parsed.content, frontmatter))
}


fn parse_canvas_file(path: &Path) -> Result<(String, String, HashMap<String, Value>), String> {
    let title = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Canvas".to_string());
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut frontmatter = HashMap::new();
    frontmatter.insert("type".to_string(), Value::String("Canvas".to_string()));
    Ok((title, content, frontmatter))
}

/// Recursively scans and indexes a directory.
pub fn sync_entire_directory(vault_path: &Path, db_path: &str) -> Result<(), String> {
    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;

    let mut visit = |path: &Path| {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if path.is_file() && (ext == "md" || ext == "canvas") {
            println!("Syncing existing file: {:?}", path);
            let parse_res = if ext == "canvas" {
                parse_canvas_file(path)
            } else {
                parse_markdown_file(path)
            };
            match parse_res {
                Ok((title, content, frontmatter)) => {
                    let rel_path = path
                        .strip_prefix(vault_path)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .into_owned();
                    match db::upsert_note(&conn, &rel_path, &title, &content, &frontmatter) {
                        Ok(note_id) => {
                            if ext == "md" {
                                if should_ai_index(path, &frontmatter) {
                                    if let Err(e) = crate::search::index_note_vectors(db_path, &note_id, &content) {
                                        eprintln!("Failed to index note vectors: {:?}", e);
                                    }
                                } else {
                                    if let Err(e) = db::clear_note_chunks(&conn, &note_id) {
                                        eprintln!("Failed to clear note chunks: {:?}", e);
                                    }
                                }
                            }
                        }
                        Err(e) => eprintln!("Failed to upsert note in db: {:?}", e),
                    }
                }
                Err(e) => eprintln!("Failed to parse file: {:?}", e),
            }
        }
    };

    fn visit_dirs(dir: &Path, cb: &mut dyn FnMut(&Path)) -> std::io::Result<()> {
        if dir.is_dir() {
            if dir.file_name().map_or(false, |name| name == ".trash") {
                return Ok(());
            }
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, cb)?;
                } else {
                    cb(&path);
                }
            }
        }
        Ok(())
    }

    visit_dirs(vault_path, &mut visit).map_err(|e| e.to_string())?;
    Ok(())
}

/// Spawns a filesystem watcher that runs in the background.
pub fn start_directory_watcher(
    vault_path_str: String,
    db_path_str: String,
) -> Result<RecommendedWatcher, String> {
    let vault_path = PathBuf::from(&vault_path_str);
    let db_path = Arc::new(db_path_str);
    let vault_path_clone = vault_path.clone();
    
    // Perform initial sync
    sync_entire_directory(&vault_path, &db_path)?;

    // Create watcher
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                let db_path = Arc::clone(&db_path);
                let vault_path = vault_path_clone.clone();
                
                // Process event paths
                for path in event.paths {
                    if path.extension().map_or(false, |ext| ext == "md") {
                        let conn = match db::init_db(&db_path) {
                            Ok(c) => c,
                            Err(e) => {
                                eprintln!("Watcher could not connect to SQLite: {:?}", e);
                                continue;
                            }
                        };
                        
                        let rel_path = path
                            .strip_prefix(&vault_path)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .into_owned();

                        if rel_path.starts_with(".trash") || rel_path.contains("/.trash") || rel_path.contains("\\.trash") {
                            continue;
                        }

                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                        if ext != "md" && ext != "canvas" {
                            continue;
                        }

                        if event.kind.is_remove() {
                            println!("File deleted: {:?}", path);
                            if let Err(e) = db::delete_note_by_path(&conn, &rel_path) {
                                eprintln!("Failed to delete note from DB: {:?}", e);
                            }
                        } else if event.kind.is_create() || event.kind.is_modify() {
                            println!("File created/modified: {:?}", path);
                            if path.exists() {
                                let parse_res = if ext == "canvas" {
                                    parse_canvas_file(&path)
                                } else {
                                    parse_markdown_file(&path)
                                };
                                match parse_res {
                                    Ok((title, content, frontmatter)) => {
                                        match db::upsert_note(&conn, &rel_path, &title, &content, &frontmatter) {
                                            Ok(note_id) => {
                                                if ext == "md" {
                                                    if should_ai_index(&path, &frontmatter) {
                                                        if let Err(e) = crate::search::index_note_vectors(&db_path, &note_id, &content) {
                                                            eprintln!("Failed to index note vectors: {:?}", e);
                                                        }
                                                    } else {
                                                        if let Err(e) = db::clear_note_chunks(&conn, &note_id) {
                                                            eprintln!("Failed to clear note chunks: {:?}", e);
                                                        }
                                                    }
                                                }
                                            }
                                            Err(e) => eprintln!("Failed to upsert modified note: {:?}", e),
                                        }
                                    }
                                    Err(e) => eprintln!("Failed to parse created/modified file: {:?}", e),
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => eprintln!("Watcher error: {:?}", e),
        },
        notify::Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&vault_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    Ok(watcher)
}
