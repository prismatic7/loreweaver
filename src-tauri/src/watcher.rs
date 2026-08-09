//! # Directory Watcher & Vault Synchronization Pipeline
//!
//! This module provides real-time filesystem monitoring and automated SQLite index
//! synchronization for user Campaign Vaults.
//!
//! ## Key Architectural Responsibilities
//! 1. **Initial Full Directory Sync (`sync_entire_directory`)**: Performs a recursive walk over
//!    the vault directory at startup to ingest Markdown (`.md`) and Canvas (`.canvas`) files,
//!    upserting note records in SQLite, generating vector search embeddings (unless suppressed),
//!    and purging orphaned DB entries for files deleted while the app was closed.
//! 2. **Debounced Real-Time File Watching (`start_directory_watcher`)**: Uses cross-platform `notify`
//!    file system notifications coupled with a background flusher thread. Rapid file write events
//!    (e.g., auto-saves during typing) are coalesced over a 500ms window to reduce DB and CPU churn.
//! 3. **Path & Frontmatter Metadata Extraction (`parse_markdown_file`, `parse_canvas_file`)**:
//!    Parses YAML frontmatter, extracts custom titles or H1 header fallbacks, and cleans links.
//! 4. **AI Indexing Opt-Out Scoping (`should_ai_index`)**: Enforces file-level frontmatter toggles
//!    (`ai_index: false`) and tree-level `.noai` marker files to respect user privacy boundaries.

use crate::db;
use gray_matter::{engine::YAML, Matter};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;


/// Sanitizes note title strings by stripping markdown links (`[Label](loreweaver-note:Target)`),
/// brackets, parentheses, and wiki-link pipe aliases (`Target|Label`).
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

/// Evaluates whether a note file should be processed for semantic vector search embeddings.
///
/// Returns `false` if:
/// 1. The note frontmatter explicitly contains `ai_index: false` (or `"false"` / `"0"`).
/// 2. Any ancestor directory in the vault path contains a `.noai` marker file.
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

/// Parses a Markdown file using `gray_matter`, extracting YAML frontmatter and note content.
///
/// Title Determination Hierarchy:
/// 1. `title` field in YAML frontmatter.
/// 2. First H1 heading (`# Heading Title`) in raw content.
/// 3. Filename stem fallback if neither is available.
pub fn parse_markdown_file(
    path: &Path,
) -> Result<(String, String, HashMap<String, Value>), String> {
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

/// Parses an Obsidian-compatible `.canvas` file.
/// Extracts filename as title and raw JSON text as content with a default `type: Canvas` frontmatter map.
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

/// Recursively scans and indexes an entire vault directory into SQLite.
///
/// Workflow:
/// 1. Walks `vault_path` recursively skipping `.trash` directories.
/// 2. Ingests all `.md` and `.canvas` files into the `notes` table via `db::upsert_note`.
/// 3. If AI vector indexing is permitted (`should_ai_index`), generates semantic embeddings via `crate::search::index_note_vectors`.
/// 4. Compares disk files against SQLite records and purges DB rows for files removed from disk while offline.
/// 5. Invalidates in-memory search caches.
pub fn sync_entire_directory(vault_path: &Path, conn: &rusqlite::Connection) -> Result<(), String> {
    let mut disk_paths: HashSet<String> = HashSet::new();

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
                    disk_paths.insert(rel_path.clone());
                    match db::upsert_note(conn, &rel_path, &title, &content, &frontmatter) {
                        Ok(note_id) => {
                            if ext == "md" {
                                if should_ai_index(path, &frontmatter) {
                                    if let Err(e) =
                                        crate::search::index_note_vectors(conn, &note_id, &content)
                                    {
                                        eprintln!("Failed to index note vectors: {:?}", e);
                                    }
                                } else {
                                    if let Err(e) = db::clear_note_chunks(conn, &note_id) {
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

    // Purge DB rows for files that are no longer present on disk.
    if let Ok(db_paths) = db::all_note_paths(&conn) {
        for path in db_paths {
            if !disk_paths.contains(&path) {
                println!("Purging missing note from DB: {}", path);
                let _ = db::delete_note_by_path(&conn, &path);
            }
        }
    }

    crate::search::invalidate_cache();
    Ok(())
}

/// Spawns a background filesystem watcher monitoring the active vault.
///
/// ### Architecture & Debouncing Strategy
/// - Performs an initial synchronous directory walk (`sync_entire_directory`) prior to event registration.
/// - Spawns a dedicated flusher thread (`std::thread::spawn`) that wakes every 500ms and exits
///   cleanly when the provided `shutdown` flag is set.
/// - Collects raw filesystem events (`RecommendedWatcher`) into a shared `pending` queue (`Arc<Mutex<HashMap<PathBuf, (bool, Instant)>>>`).
/// - Coalesces events: only processes files whose last event timestamp is older than 400ms.
/// - On processing, invokes `process_file_event` to sync SQLite and emits a `vault-changed` event to the React frontend via Tauri IPC.
pub fn start_directory_watcher(
    vault_path_str: String,
    conn: Arc<Mutex<rusqlite::Connection>>,
    app_handle: tauri::AppHandle,
    shutdown: Arc<AtomicBool>,
) -> Result<RecommendedWatcher, String> {
    let vault_path = PathBuf::from(&vault_path_str);
    let vault_path_clone = vault_path.clone();

    // Perform initial sync
    {
        let conn_guard = conn.lock().map_err(|e| e.to_string())?;
        sync_entire_directory(&vault_path, &conn_guard)?;
    }

    // Pending events: path -> (is_remove, last_seen)
    let pending: Arc<Mutex<HashMap<PathBuf, (bool, Instant)>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Debounce flusher thread
    let pending_flush = Arc::clone(&pending);
    let conn_flush = Arc::clone(&conn);
    let vault_path_flush = vault_path_clone.clone();
    let app_handle_flush = app_handle.clone();
    std::thread::spawn(move || loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
        if shutdown.load(Ordering::Relaxed) {
            break;
        }
        let to_process: Vec<(PathBuf, bool)> = {
            let mut p = pending_flush.lock().unwrap_or_else(|e| e.into_inner());
            if p.is_empty() {
                continue;
            }
            // Only flush entries that haven't been touched in the last 400ms
            let now = Instant::now();
            let stale: Vec<_> = p
                .iter()
                .filter(|(_, (_, ts))| now.duration_since(*ts) > Duration::from_millis(400))
                .map(|(k, (is_rem, _))| (k.clone(), *is_rem))
                .collect();
            for (k, _) in &stale {
                p.remove(k);
            }
            stale
        };

        let conn_guard = match conn_flush.lock() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("Watcher flush could not acquire DB lock: {:?}", e);
                continue;
            }
        };
        for (path, is_remove) in to_process {
            process_file_event(&path, is_remove, &conn_guard, &vault_path_flush, &app_handle_flush);
        }
    });

    // Create watcher
    let pending_watcher = Arc::clone(&pending);
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                let is_remove = event.kind.is_remove();
                for path in event.paths {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext != "md" && ext != "canvas" {
                        continue;
                    }
                    let rel_path = path
                        .strip_prefix(&vault_path_clone)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned();
                    if rel_path.starts_with(".trash")
                        || rel_path.contains("/.trash")
                        || rel_path.contains("\\.trash")
                    {
                        continue;
                    }
                    let mut p = pending_watcher.lock().unwrap_or_else(|e| e.into_inner());
                    p.insert(path, (is_remove, Instant::now()));
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

/// Processes a single file change or deletion event.
///
/// Handlers:
/// - Deletion (`is_remove` or `!path.exists()`): Removes note record from SQLite.
/// - Creation / Modification: Parses note frontmatter/content, upserts SQLite record, updates AI search vectors (if allowed), invalidates search cache, and broadcasts `vault-changed` to frontend window.
fn process_file_event(
    path: &Path,
    is_remove: bool,
    conn: &rusqlite::Connection,
    vault_path: &Path,
    app_handle: &tauri::AppHandle,
) {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let rel_path = path
        .strip_prefix(vault_path)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned();

    if is_remove || !path.exists() {
        println!("File deleted: {:?}", path);
        if let Err(e) = db::delete_note_by_path(conn, &rel_path) {
            eprintln!("Failed to delete note from DB: {:?}", e);
        }
    } else {
        println!("File created/modified: {:?}", path);
        let parse_res = if ext == "canvas" {
            parse_canvas_file(path)
        } else {
            parse_markdown_file(path)
        };
        match parse_res {
            Ok((title, content, frontmatter)) => {
                match db::upsert_note(conn, &rel_path, &title, &content, &frontmatter) {
                    Ok(note_id) => {
                        if ext == "md" {
                            if should_ai_index(path, &frontmatter) {
                                if let Err(e) =
                                    crate::search::index_note_vectors(conn, &note_id, &content)
                                {
                                    eprintln!("Failed to index note vectors: {:?}", e);
                                }
                            } else {
                                if let Err(e) = db::clear_note_chunks(conn, &note_id) {
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

    crate::search::invalidate_cache();
    let _ = app_handle.emit("vault-changed", ());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_parse_markdown_file_with_frontmatter() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("test_note_{}.md", uuid::Uuid::new_v4()));
        let mut file = std::fs::File::create(&file_path).unwrap();
        write!(
            file,
            "---\ntitle: Custom Title\ntags: [location, city]\n---\n# Header\nNote content."
        )
        .unwrap();

        let (title, content, frontmatter) = parse_markdown_file(&file_path).unwrap();
        assert_eq!(title, "Custom Title");
        assert_eq!(content.trim(), "# Header\nNote content.");
        assert_eq!(
            frontmatter.get("title").and_then(|v| v.as_str()),
            Some("Custom Title")
        );
        assert!(frontmatter.get("tags").is_some());

        let _ = std::fs::remove_file(file_path);
    }

    #[test]
    fn test_parse_markdown_file_fallback_h1() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("test_note_{}.md", uuid::Uuid::new_v4()));
        let mut file = std::fs::File::create(&file_path).unwrap();
        write!(file, "# Heading Title\nNote body without YAML.").unwrap();

        let (title, content, frontmatter) = parse_markdown_file(&file_path).unwrap();
        assert_eq!(title, "Heading Title");
        assert_eq!(content.trim(), "# Heading Title\nNote body without YAML.");
        assert!(frontmatter.is_empty());

        let _ = std::fs::remove_file(file_path);
    }

    #[test]
    fn test_parse_canvas_file() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("test_note_{}.canvas", uuid::Uuid::new_v4()));
        let mut file = std::fs::File::create(&file_path).unwrap();
        write!(file, "{{\"nodes\": []}}").unwrap();

        let (title, content, frontmatter) = parse_canvas_file(&file_path).unwrap();
        assert_eq!(content, "{\"nodes\": []}");
        assert_eq!(
            frontmatter.get("type").and_then(|v| v.as_str()),
            Some("Canvas")
        );
        assert!(!title.is_empty());

        let _ = std::fs::remove_file(file_path);
    }
}
