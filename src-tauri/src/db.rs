use rusqlite::{params, Connection, Result};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

/// Database Initialization & Persistence Architecture
///
/// Loreweaver uses an embedded SQLite database managed via `rusqlite` to store structured campaign
/// notes, system rules, application configuration settings, and binary vector embeddings for hybrid search.
///
/// ### Core Architectural Concepts:
/// - **Write-Ahead Logging (WAL Mode)**: Enabled via `PRAGMA journal_mode = WAL;`. In standard rollback journal mode,
///   write operations acquire an exclusive lock that blocks all readers. WAL mode writes changes to a separate `-wal`
///   sidecar file first while allowing concurrent readers to access the main database file. This ensures UI queries
///   remain snappy and non-blocking even when background file watching or batch indexing jobs commit updates.
/// - **Busy Timeout**: Configured via `conn.busy_timeout(...)`. When SQLite encounters a temporary table or database
///   lock under concurrent access, it automatically waits and retries for up to 5000ms instead of immediately failing
///   with a `SQLITE_BUSY` error.
/// - **Foreign Key Constraints (`PRAGMA foreign_keys = ON;`)**: SQLite has foreign keys disabled by default for legacy
///   backward compatibility. Explicitly executing `PRAGMA foreign_keys = ON;` enforces referential integrity across all
///   table relationships (such as note metadata and vector chunk parent keys).
/// - **Cascading Deletes (`ON DELETE CASCADE`)**: Configured on foreign keys (`note_metadata` -> `notes`,
///   `note_chunks` -> `notes`, `rule_chunks` -> `rules`). When a parent note or rule row is deleted, SQLite automatically
///   purges all associated metadata rows and vector embedding chunks in a single atomic transaction, preventing
///   orphaned records without requiring verbose manual deletion logic.
/// - **Dynamic Schema Migrations**: Safe, lightweight inline migration checks inspect table schema metadata at runtime
///   (e.g., using `PRAGMA table_info(rules)` to detect if new columns like `path` exist) and issue `ALTER TABLE`
///   modifications if missing. This pattern guarantees backward compatibility across application updates without
///   requiring full migration framework overhead for simple schema evolutions.
pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    // 1. Database Configuration Pragmas:
    // Enforce foreign key constraints, set WAL journal mode for non-blocking concurrent reads,
    // and configure a 5-second busy timeout for lock resolution.
    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;

    // 2. Primary Notes Table:
    // Stores core campaign note metadata and raw markdown body content indexed by unique file path.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );",
        [],
    )?;

    // 3. Note Metadata Table:
    // Stores key-value frontmatter attributes extracted from notes.
    // Demonstrates Foreign Keys & Cascading Deletes: ON DELETE CASCADE automatically purges metadata
    // rows when the parent note is removed from the `notes` table.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_metadata (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            meta_key TEXT NOT NULL,
            meta_value TEXT NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
            UNIQUE(note_id, meta_key)
        );",
        [],
    )?;

    // 4. Rules Reference Table:
    // Stores game mechanics, SRD content, and campaign rules indexed by category and source.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            source TEXT NOT NULL,
            content TEXT NOT NULL
        );",
        [],
    )?;

    // 5. Dynamic Schema Migration Check:
    // Inspects `rules` table columns via `PRAGMA table_info(rules)`. If a legacy database is loaded
    // missing the `path` column, dynamically appends it with ALTER TABLE to preserve backward compatibility.
    let has_path_col: bool = conn
        .prepare("PRAGMA table_info(rules);")?
        .query_map([], |row| {
            let col_name: String = row.get(1)?;
            Ok(col_name)
        })?
        .any(|col_res| col_res.map(|name| name == "path").unwrap_or(false));

    if !has_path_col {
        let _ = conn.execute("ALTER TABLE rules ADD COLUMN path TEXT NOT NULL DEFAULT '';", []);
    }

    // 6. Vector Chunk Storage Tables:
    // Stores segmented note text snippets alongside binary float array vector embeddings (BLOBs).
    // Configured with ON DELETE CASCADE to automatically clean up vectors when notes/rules are deleted.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_chunks (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding BLOB NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS rule_chunks (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding BLOB NOT NULL,
            FOREIGN KEY (rule_id) REFERENCES rules (id) ON DELETE CASCADE
        );",
        [],
    )?;

    // 7. Application Settings Table:
    // Key-value store for app configuration, selected AI models, prompt templates, and active settings.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )?;

    // 7b. Session Memory Table:
    // Stores persistent campaign facts (NPCs, decisions, plot threads) that the
    // Campaign Architect retrieves across chat turns. Scoped per-vault because
    // the DB is re-initialized on vault switch.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS session_memory (
            id TEXT PRIMARY KEY,
            fact TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            created_at INTEGER NOT NULL
        );",
        [],
    )?;

    // 7c. Sources Table:
    // Stores provenance records (canon, history, invention, or user-defined types)
    // that notes can link to via the `source_id` frontmatter key. Kept separate from
    // the notes table so provenance metadata is reusable across many notes.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL DEFAULT '',
            source_type TEXT NOT NULL DEFAULT 'canon',
            url TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        );",
        [],
    )?;

    // 8. FTS5 Virtual Tables for Full-Text Search:
    // High-performance SQLite FTS5 index structures for fast full-text keyword matching and BM25 ranking.
    let _ = conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            note_id UNINDEXED,
            title,
            content
        );",
        [],
    );

    let _ = conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS rules_fts USING fts5(
            rule_id UNINDEXED,
            title,
            category,
            content
        );",
        [],
    );

    Ok(conn)
}

pub fn upsert_note(
    conn: &Connection,
    path: &str,
    title: &str,
    content: &str,
    frontmatter: &HashMap<String, Value>,
) -> Result<String> {
    // Check if note exists by path
    let mut stmt = conn.prepare("SELECT id FROM notes WHERE path = ?1")?;
    let mut rows = stmt.query(params![path])?;

    let note_id = if let Some(row) = rows.next()? {
        row.get::<_, String>(0)?
    } else {
        Uuid::new_v4().to_string()
    };

    let now = chrono::Utc::now().timestamp();

    // Upsert note
    conn.execute(
        "INSERT INTO notes (id, path, title, content, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            updated_at = excluded.updated_at;",
        params![note_id, path, title, content, now],
    )?;

    // Clear old metadata
    conn.execute(
        "DELETE FROM note_metadata WHERE note_id = ?1;",
        params![note_id],
    )?;

    // Insert new metadata
    for (k, v) in frontmatter {
        let val_str = match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        let meta_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR REPLACE INTO note_metadata (id, note_id, meta_key, meta_value)
             VALUES (?1, ?2, ?3, ?4);",
            params![meta_id, note_id, k, val_str],
        )?;
    }

    // Sync FTS5 search index
    let _ = conn.execute(
        "DELETE FROM notes_fts WHERE note_id = ?1;",
        params![note_id],
    );
    let _ = conn.execute(
        "INSERT INTO notes_fts (note_id, title, content) VALUES (?1, ?2, ?3);",
        params![note_id, title, content],
    );

    Ok(note_id)
}

pub fn delete_note_by_path(conn: &Connection, path: &str) -> Result<()> {
    if let Ok(note_id) = conn.query_row::<String, _, _>(
        "SELECT id FROM notes WHERE path = ?1;",
        params![path],
        |r| r.get(0),
    ) {
        let _ = conn.execute(
            "DELETE FROM notes_fts WHERE note_id = ?1;",
            params![note_id],
        );
    }
    conn.execute("DELETE FROM notes WHERE path = ?1;", params![path])?;
    Ok(())
}

/// Deletes all notes whose path matches a folder prefix and cleans up their FTS entries.
/// Uses cascading FK deletes for metadata and vector chunks.
pub fn delete_notes_in_folder(conn: &Connection, folder_path: &str) -> Result<()> {
    // First purge FTS entries for all matching notes so the virtual table stays in sync.
    let _ = conn.execute(
        "DELETE FROM notes_fts WHERE note_id IN (SELECT id FROM notes WHERE path LIKE ?1 OR path = ?2);",
        params![format!("{}/%", folder_path), folder_path],
    );
    conn.execute(
        "DELETE FROM notes WHERE path LIKE ?1 OR path = ?2;",
        params![format!("{}/%", folder_path), folder_path],
    )?;
    Ok(())
}

/// Returns every note path currently stored in the DB.
pub fn all_note_paths(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM notes;")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut paths = Vec::new();
    for row in rows {
        paths.push(row?);
    }
    Ok(paths)
}

pub fn load_all_notes(conn: &Connection) -> Result<Vec<super::CampaignNote>> {
    // Single query: get all notes, then batch-load all metadata in one pass
    let mut stmt = conn.prepare("SELECT id, path, title, content FROM notes")?;
    let note_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    let mut notes: Vec<super::CampaignNote> = Vec::new();
    for row in note_rows {
        let (id, path, title, content) = row?;
        notes.push(super::CampaignNote {
            id,
            title,
            path,
            frontmatter: HashMap::new(),
            content,
        });
    }

    // Batch-load all metadata in a single query
    if !notes.is_empty() {
        let note_ids: Vec<String> = notes.iter().map(|n| n.id.clone()).collect();
        let placeholders: Vec<String> = note_ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT note_id, meta_key, meta_value FROM note_metadata WHERE note_id IN ({})",
            placeholders.join(", ")
        );
        let mut meta_stmt = conn.prepare(&sql)?;
        let meta_rows = meta_stmt.query_map(rusqlite::params_from_iter(note_ids.iter()), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;

        // Build a lookup map: note_id -> (key, value)
        let mut meta_map: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for meta in meta_rows {
            let (note_id, k, v) = meta?;
            meta_map.entry(note_id).or_default().push((k, v));
        }

        // Attach metadata to notes
        for note in &mut notes {
            if let Some(entries) = meta_map.get(&note.id) {
                for (k, v) in entries {
                    let val = serde_json::from_str(v).unwrap_or_else(|_| Value::String(v.clone()));
                    note.frontmatter.insert(k.clone(), val);
                }
            }
        }
    }

    Ok(notes)
}

/// Returns every rule row in the database.
pub fn load_all_rules(conn: &Connection) -> Result<Vec<super::RuleEntry>> {
    let mut stmt = conn.prepare("SELECT id, path, title, category, source, content FROM rules")?;
    let rows = stmt.query_map([], |row| {
        Ok(super::RuleEntry {
            id: row.get(0)?,
            path: row.get(1)?,
            title: row.get(2)?,
            category: row.get(3)?,
            source: row.get(4)?,
            content: row.get(5)?,
        })
    })?;
    let mut rules = Vec::new();
    for r in rows {
        rules.push(r?);
    }
    Ok(rules)
}

pub fn seed_default_rules(conn: &Connection) -> Result<()> {
    // Check if empty
    let count: i64 = conn.query_row("SELECT count(*) FROM rules", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let rules = vec![
        ("rule-1", "Combat Actions", "Combat", "D&D 5e SRD",
         "When you take your action on your turn, you can take one of the actions: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object."),
        ("rule-2", "Concentration", "Spellcasting", "D&D 5e SRD",
         "Some spells require you to maintain concentration. Taking damage requires a Constitution saving throw (DC 10 or half damage, whichever is higher). Being Incapacitated breaks it."),
        ("rule-3", "Resting", "General", "D&D 5e SRD",
         "Short Rest: At least 1 hour, spend Hit Dice. Long Rest: At least 8 hours, regain all HP, slots, and half max Hit Dice.")
    ];

    for (id, title, category, source, content) in rules {
        let path = format!("{}/{}.md", category, title);
        conn.execute(
            "INSERT INTO rules (id, path, title, category, source, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, path, title, category, source, content],
        )?;
    }

    Ok(())
}

pub fn clear_note_chunks(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM note_chunks WHERE note_id = ?1;",
        params![note_id],
    )?;
    Ok(())
}

pub fn insert_note_chunk(
    conn: &Connection,
    note_id: &str,
    chunk_text: &str,
    embedding: &[f32],
) -> Result<()> {
    let id = Uuid::new_v4().to_string();
    let embedding_bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|&f| f.to_ne_bytes().to_vec())
        .collect();

    conn.execute(
        "INSERT INTO note_chunks (id, note_id, chunk_text, embedding) VALUES (?1, ?2, ?3, ?4)",
        params![id, note_id, chunk_text, embedding_bytes],
    )?;
    Ok(())
}

pub fn get_all_note_chunks(
    conn: &Connection,
) -> Result<Vec<(String, String, Vec<f32>, String, String, String)>> {
    let mut stmt = conn.prepare("SELECT c.id, c.note_id, c.embedding, c.chunk_text, n.title, n.path FROM note_chunks c JOIN notes n ON c.note_id = n.id")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let note_id: String = row.get(1)?;
        let bytes: Vec<u8> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let title: String = row.get(4)?;
        let path: String = row.get(5)?;

        let mut embedding = Vec::with_capacity(bytes.len() / 4);
        for chunk in bytes.chunks_exact(4) {
            let arr: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            embedding.push(f32::from_ne_bytes(arr));
        }

        Ok((id, note_id, embedding, chunk_text, title, path))
    })?;

    let mut chunks = Vec::new();
    for r in rows {
        let (id, note_id, embedding, chunk_text, title, path) = r?;
        chunks.push((id, note_id, embedding, chunk_text, title, path));
    }
    Ok(chunks)
}

pub fn insert_rule_chunk(
    conn: &Connection,
    rule_id: &str,
    chunk_text: &str,
    embedding: &[f32],
) -> Result<()> {
    let id = Uuid::new_v4().to_string();
    let embedding_bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|&f| f.to_ne_bytes().to_vec())
        .collect();

    conn.execute(
        "INSERT INTO rule_chunks (id, rule_id, chunk_text, embedding) VALUES (?1, ?2, ?3, ?4)",
        params![id, rule_id, chunk_text, embedding_bytes],
    )?;
    Ok(())
}

pub fn get_all_rule_chunks(
    conn: &Connection,
) -> Result<Vec<(String, String, Vec<f32>, String, String, String)>> {
    let mut stmt = conn.prepare("SELECT c.id, c.rule_id, c.embedding, c.chunk_text, r.title, r.source FROM rule_chunks c JOIN rules r ON c.rule_id = r.id")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let rule_id: String = row.get(1)?;
        let bytes: Vec<u8> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let title: String = row.get(4)?;
        let source: String = row.get(5)?;

        let mut embedding = Vec::with_capacity(bytes.len() / 4);
        for chunk in bytes.chunks_exact(4) {
            let arr: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            embedding.push(f32::from_ne_bytes(arr));
        }

        Ok((id, rule_id, embedding, chunk_text, title, source))
    })?;

    let mut chunks = Vec::new();
    for r in rows {
        let (id, rule_id, embedding, chunk_text, title, source) = r?;
        chunks.push((id, rule_id, embedding, chunk_text, title, source));
    }
    Ok(chunks)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2);",
        params![key, value],
    )?;
    Ok(())
}

/// Inserts a new session memory fact.
pub fn insert_session_memory(
    conn: &Connection,
    fact: &str,
    category: &str,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO session_memory (id, fact, category, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, fact, category, now],
    )?;
    Ok(id)
}

/// Returns all session memory facts, newest first.
pub fn list_session_memory(conn: &Connection) -> Result<Vec<(String, String, String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT id, fact, category, created_at FROM session_memory ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    let mut facts = Vec::new();
    for r in rows {
        facts.push(r?);
    }
    Ok(facts)
}

/// Deletes a session memory fact by id.
pub fn delete_session_memory(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM session_memory WHERE id = ?1", params![id])?;
    Ok(())
}

/// Returns every source row in the database.
pub fn list_sources(conn: &Connection) -> Result<Vec<super::SourceEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, author, source_type, url, date FROM sources ORDER BY title ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(super::SourceEntry {
            id: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            source_type: row.get(3)?,
            url: row.get(4)?,
            date: row.get(5)?,
        })
    })?;
    let mut sources = Vec::new();
    for r in rows {
        sources.push(r?);
    }
    Ok(sources)
}

/// Inserts or updates a source row by id. Returns the source id.
pub fn upsert_source(conn: &Connection, source: &super::SourceEntry) -> Result<String> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO sources (id, title, author, source_type, url, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            source_type = excluded.source_type,
            url = excluded.url,
            date = excluded.date;",
        params![
            source.id,
            source.title,
            source.author,
            source.source_type,
            source.url,
            source.date,
            now
        ],
    )?;
    Ok(source.id.clone())
}

/// Deletes a source row by id.
pub fn delete_source(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM sources WHERE id = ?1", params![id])?;
    Ok(())
}

/// Fetches a single source row by id, if it exists.
pub fn get_source(conn: &Connection, id: &str) -> Result<Option<super::SourceEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, author, source_type, url, date FROM sources WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(super::SourceEntry {
            id: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            source_type: row.get(3)?,
            url: row.get(4)?,
            date: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

/// Upserts a rule by id. If the id already exists, updates all fields.
pub fn upsert_rule(
    conn: &Connection,
    id: &str,
    path: &str,
    title: &str,
    category: &str,
    source: &str,
    content: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO rules (id, path, title, category, source, content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            title = excluded.title,
            category = excluded.category,
            source = excluded.source,
            content = excluded.content;",
        params![id, path, title, category, source, content],
    )?;

    // Sync FTS5 search index
    let _ = conn.execute("DELETE FROM rules_fts WHERE rule_id = ?1;", params![id]);
    let _ = conn.execute(
        "INSERT INTO rules_fts (rule_id, title, category, content) VALUES (?1, ?2, ?3, ?4);",
        params![id, title, category, content],
    );

    Ok(())
}

/// Deletes a rule and all associated data (FTS index, vector chunks, rule row).
/// Cascading order: FTS entries → vector chunks → rule row.
pub fn delete_rule(conn: &Connection, rule_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM rules_fts WHERE rule_id = ?1;",
        params![rule_id],
    )?;
    conn.execute(
        "DELETE FROM rule_chunks WHERE rule_id = ?1;",
        params![rule_id],
    )?;
    conn.execute("DELETE FROM rules WHERE id = ?1;", params![rule_id])?;
    Ok(())
}

/// Deletes every rule whose path is inside `folder_path` and cleans up FTS/chunks.
pub fn delete_rules_in_folder(conn: &Connection, folder_path: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM rules_fts WHERE rule_id IN (SELECT id FROM rules WHERE path LIKE ?1 OR path = ?2);",
        params![format!("{}/%", folder_path), folder_path],
    )?;
    conn.execute(
        "DELETE FROM rule_chunks WHERE rule_id IN (SELECT id FROM rules WHERE path LIKE ?1 OR path = ?2);",
        params![format!("{}/%", folder_path), folder_path],
    )?;
    conn.execute(
        "DELETE FROM rules WHERE path LIKE ?1 OR path = ?2;",
        params![format!("{}/%", folder_path), folder_path],
    )?;
    Ok(())
}

/// Re-indexes vector chunks for a single rule.
pub fn reindex_rule_chunks(conn: &Connection, rule_id: &str, content: &str) -> Result<()> {
    let _ = conn.execute(
        "DELETE FROM rule_chunks WHERE rule_id = ?1;",
        params![rule_id],
    );

    let chunks = crate::search::chunk_text(content, 120, 20);
    for chunk in chunks {
        if chunk.trim().is_empty() {
            continue;
        }
        match crate::search::generate_embedding(&chunk) {
            Ok(embedding) => {
                insert_rule_chunk(conn, rule_id, &chunk, &embedding)?;
            }
            Err(e) => {
                eprintln!("Could not generate rule embedding: {:?}", e);
                let empty_emb = vec![0.0f32; 384];
                insert_rule_chunk(conn, rule_id, &chunk, &empty_emb)?;
            }
        }
    }
    Ok(())
}

/// FTS5 keyword search over notes. Returns (note_id, title, snippet, score).
pub fn fts_search_notes(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<(String, String, String, f32)>> {
    // Escape FTS5 special characters by quoting the query
    let escaped_query = format!("\"{}\"", query.replace('"', "\"\""));

    let sql = "SELECT n.id, n.title, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 10), bm25(notes_fts)
               FROM notes_fts
               JOIN notes n ON notes_fts.note_id = n.id
               WHERE notes_fts MATCH ?1
               ORDER BY bm25(notes_fts)
               LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![escaped_query, limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f32>(3)?,
        ))
    })?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    // Normalize bm25 score: lower (more negative) = better, convert to 0..1
    let results = results
        .into_iter()
        .map(|(id, title, snippet, bm25)| {
            let score = (-bm25).max(0.0) / ((-bm25).max(0.0) + 1.0);
            (id, title, snippet, score)
        })
        .collect();
    Ok(results)
}

/// FTS5 keyword search over rules. Returns (rule_id, title, snippet, score).
pub fn fts_search_rules(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<(String, String, String, f32)>> {
    let escaped_query = format!("\"{}\"", query.replace('"', "\"\""));

    let sql = "SELECT r.id, r.title, snippet(rules_fts, 3, '<mark>', '</mark>', '...', 10), bm25(rules_fts)
               FROM rules_fts
               JOIN rules r ON rules_fts.rule_id = r.id
               WHERE rules_fts MATCH ?1
               ORDER BY bm25(rules_fts)
               LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![escaped_query, limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f32>(3)?,
        ))
    })?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    let results = results
        .into_iter()
        .map(|(id, title, snippet, bm25)| {
            let score = (-bm25).max(0.0) / ((-bm25).max(0.0) + 1.0);
            (id, title, snippet, score)
        })
        .collect();
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_init_and_settings() {
        let conn = init_db(":memory:").expect("Failed to initialize memory DB");

        let setting = get_setting(&conn, "test_key").expect("Failed to get setting");
        assert!(setting.is_none());

        set_setting(&conn, "test_key", "test_value").expect("Failed to set setting");
        let setting = get_setting(&conn, "test_key").expect("Failed to get setting");
        assert_eq!(setting, Some("test_value".to_string()));
    }

    #[test]
    fn test_note_operations() {
        let conn = init_db(":memory:").expect("Failed to initialize memory DB");

        let path = "Worldbuilding/Eldoria.md";
        let title = "Eldoria";
        let content = "# Eldoria\nAncient elven city.";
        let mut frontmatter = HashMap::new();
        frontmatter.insert("type".to_string(), Value::String("Location".to_string()));

        let note_id =
            upsert_note(&conn, path, title, content, &frontmatter).expect("Failed to upsert note");

        let notes = load_all_notes(&conn).expect("Failed to load notes");
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, note_id);
        assert_eq!(notes[0].path, path);
        assert_eq!(notes[0].title, title);
        assert_eq!(notes[0].content, content);
        assert_eq!(
            notes[0].frontmatter.get("type").and_then(|v| v.as_str()),
            Some("Location")
        );

        // Delete note
        delete_note_by_path(&conn, path).expect("Failed to delete note");
        let notes = load_all_notes(&conn).expect("Failed to load notes");
        assert_eq!(notes.len(), 0);
    }

    #[test]
    fn test_rule_operations() {
        let conn = init_db(":memory:").expect("Failed to initialize memory DB");

        let rule_id = "test-rule-id";
        let title = "Spellcasting";
        let category = "Rules";
        let source = "D&D 5e SRD";
        let content = "Spellcasting is the action of casting a spell.";

        upsert_rule(
            &conn,
            rule_id,
            "Rules/Spellcasting.md",
            title,
            category,
            source,
            content,
        )
        .expect("Failed to upsert rule");

        let count: i64 = conn
            .query_row("SELECT count(*) FROM rules", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Delete rule
        delete_rule(&conn, rule_id).expect("Failed to delete rule");
        let count: i64 = conn
            .query_row("SELECT count(*) FROM rules", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_source_crud() {
        let conn = init_db(":memory:").expect("Failed to initialize memory DB");

        // Initially empty.
        assert!(list_sources(&conn).unwrap().is_empty());

        // Insert a source.
        let source = crate::SourceEntry {
            id: "src-1".to_string(),
            title: "The Necronomicon".to_string(),
            author: "Abdul Alhazred".to_string(),
            source_type: "canon".to_string(),
            url: "https://example.com/necro".to_string(),
            date: "1928".to_string(),
        };
        let id = upsert_source(&conn, &source).unwrap();
        assert_eq!(id, "src-1");

        let fetched = get_source(&conn, "src-1").unwrap().expect("source exists");
        assert_eq!(fetched.title, "The Necronomicon");
        assert_eq!(fetched.author, "Abdul Alhazred");
        assert_eq!(fetched.source_type, "canon");

        // Update the same id (upsert).
        let updated = crate::SourceEntry {
            id: "src-1".to_string(),
            title: "The Necronomicon (Annotated)".to_string(),
            author: "Abdul Alhazred".to_string(),
            source_type: "history".to_string(),
            url: "https://example.com/necro".to_string(),
            date: "1928".to_string(),
        };
        upsert_source(&conn, &updated).unwrap();
        let fetched = get_source(&conn, "src-1").unwrap().unwrap();
        assert_eq!(fetched.title, "The Necronomicon (Annotated)");
        assert_eq!(fetched.source_type, "history");

        // Listing returns the single source.
        let all = list_sources(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "src-1");

        // Delete.
        delete_source(&conn, "src-1").unwrap();
        assert!(get_source(&conn, "src-1").unwrap().is_none());
        assert!(list_sources(&conn).unwrap().is_empty());
    }
}
