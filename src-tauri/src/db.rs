use rusqlite::{params, Connection, Result};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    // Enable foreign keys, set WAL journal mode and busy timeout
    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;

    // Create notes table
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

    // Create note frontmatter metadata table
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

    // Create rules table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            source TEXT NOT NULL,
            content TEXT NOT NULL
        );",
        [],
    )?;

    // Create note chunks for vector search
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

    // Create rule chunks for vector search
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

    // Create settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )?;

    // Create FTS5 virtual tables for high-performance keyword search
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
    conn.execute("DELETE FROM note_metadata WHERE note_id = ?1;", params![note_id])?;

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
    let _ = conn.execute("DELETE FROM notes_fts WHERE note_id = ?1;", params![note_id]);
    let _ = conn.execute(
        "INSERT INTO notes_fts (note_id, title, content) VALUES (?1, ?2, ?3);",
        params![note_id, title, content],
    );

    Ok(note_id)
}

pub fn delete_note_by_path(conn: &Connection, path: &str) -> Result<()> {
    if let Ok(note_id) = conn.query_row::<String, _, _>("SELECT id FROM notes WHERE path = ?1;", params![path], |r| r.get(0)) {
        let _ = conn.execute("DELETE FROM notes_fts WHERE note_id = ?1;", params![note_id]);
    }
    conn.execute("DELETE FROM notes WHERE path = ?1;", params![path])?;
    Ok(())
}

pub fn load_all_notes(conn: &Connection) -> Result<Vec<super::CampaignNote>> {
    let mut stmt = conn.prepare("SELECT id, path, title, content FROM notes")?;
    let note_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    let mut notes = Vec::new();
    for row in note_rows {
        let (id, path, title, content) = row?;
        
        // Fetch metadata
        let mut meta_stmt = conn.prepare(
            "SELECT meta_key, meta_value FROM note_metadata WHERE note_id = ?1"
        )?;
        let meta_rows = meta_stmt.query_map(params![id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;

        let mut frontmatter = HashMap::new();
        for meta in meta_rows {
            let (k, v) = meta?;
            // Try to parse value as JSON, fallback to String
            let val = serde_json::from_str(&v).unwrap_or_else(|_| Value::String(v));
            frontmatter.insert(k, val);
        }

        notes.push(super::CampaignNote {
            id,
            title,
            path,
            frontmatter,
            content,
        });
    }

    Ok(notes)
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
        conn.execute(
            "INSERT INTO rules (id, title, category, source, content) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, category, source, content],
        )?;
    }

    Ok(())
}

pub fn clear_note_chunks(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute("DELETE FROM note_chunks WHERE note_id = ?1;", params![note_id])?;
    Ok(())
}

pub fn insert_note_chunk(conn: &Connection, note_id: &str, chunk_text: &str, embedding: &[f32]) -> Result<()> {
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

pub fn get_all_note_chunks(conn: &Connection) -> Result<Vec<(String, String, Vec<f32>, String, String)>> {
    let mut stmt = conn.prepare("SELECT c.id, c.note_id, c.embedding, c.chunk_text, n.title FROM note_chunks c JOIN notes n ON c.note_id = n.id")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let note_id: String = row.get(1)?;
        let bytes: Vec<u8> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let title: String = row.get(4)?;

        let mut embedding = Vec::with_capacity(bytes.len() / 4);
        for chunk in bytes.chunks_exact(4) {
            let arr: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            embedding.push(f32::from_ne_bytes(arr));
        }

        Ok((id, note_id, embedding, chunk_text, title))
    })?;

    let mut chunks = Vec::new();
    for r in rows {
        let (id, note_id, embedding, chunk_text, title) = r?;
        chunks.push((id, note_id, embedding, chunk_text, title));
    }
    Ok(chunks)
}

pub fn insert_rule_chunk(conn: &Connection, rule_id: &str, chunk_text: &str, embedding: &[f32]) -> Result<()> {
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

pub fn get_all_rule_chunks(conn: &Connection) -> Result<Vec<(String, String, Vec<f32>, String, String, String)>> {
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
