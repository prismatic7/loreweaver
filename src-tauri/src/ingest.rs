use crate::db;
use crate::search;
use rusqlite::params;
use uuid::Uuid;

/// SRD Ingestion & Parsing Engine
/// Iterates over raw Markdown rulebooks, parses and chunks headers (#, ##, ###),
/// and generates indexing embeddings in the SQLite rules reference tables.

/// Ingests raw markdown text content directly.
pub fn ingest_markdown_text(
    conn: &rusqlite::Connection,
    content: &str,
    category: &str,
    source: &str,
) -> Result<(), String> {
    println!(
        "Ingesting SRD content (Category: {}, Source: {})",
        category, source
    );

    let mut current_title = format!("{} Introduction", source);
    let mut current_body = Vec::new();

    // Iterate through lines, split sections by headers
    for line in content.lines() {
        if line.starts_with("# ") || line.starts_with("## ") || line.starts_with("### ") {
            // Save the previous section
            let section_text = current_body.join("\n");
            if !section_text.trim().is_empty() {
                save_rule_entry(&conn, &current_title, category, source, &section_text)?;
            }
            current_body.clear();

            // Set new section title
            current_title = line.trim_start_matches('#').trim().to_string();
        } else {
            current_body.push(line);
        }
    }

    // Save final section
    let section_text = current_body.join("\n");
    if !section_text.trim().is_empty() {
        save_rule_entry(&conn, &current_title, category, source, &section_text)?;
    }

    search::invalidate_cache();
    println!("SRD text content ingestion complete!");
    Ok(())
}

fn save_rule_entry(
    conn: &rusqlite::Connection,
    title: &str,
    category: &str,
    source: &str,
    content: &str,
) -> Result<(), String> {
    let rule_id = Uuid::new_v4().to_string();
    let path = format!("{}/{}.md", category, title);
    conn.execute(
        "INSERT INTO rules (id, path, title, category, source, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![rule_id, path, title, category, source, content],
    )
    .map_err(|e| e.to_string())?;

    // Create vector chunks for this rule
    let chunks = search::chunk_text(content, 120, 20);
    for chunk in chunks {
        if chunk.trim().is_empty() {
            continue;
        }

        match search::generate_embedding(&chunk) {
            Ok(embedding) => {
                db::insert_rule_chunk(conn, &rule_id, &chunk, &embedding)
                    .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                eprintln!("Could not generate rule embedding: {:?}", e);
                let empty_emb = vec![0.0f32; 384];
                db::insert_rule_chunk(conn, &rule_id, &chunk, &empty_emb)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ingest_markdown_text() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_ingest_{}.db", uuid::Uuid::new_v4()));
        let db_path_str = db_path.to_string_lossy().to_string();

        let conn = db::init_db(&db_path_str).unwrap();
        let content = "# Fireball\nFireball deals fire damage.\n## Magic Missile\nMagic Missile hits automatically.";
        let res = ingest_markdown_text(&conn, content, "Spells", "SRD 5e");
        assert!(res.is_ok());

        // Connect to the DB to verify
        let mut stmt = conn.prepare("SELECT title, category, source, content FROM rules WHERE path = '' OR path LIKE '%/%' ORDER BY title").unwrap();
        let mut rows = stmt.query([]).unwrap();

        // First row (should be "Fireball" or "SRD 5e Introduction")
        // The first header is "# Fireball", and before it there was no content.
        // Wait, current_title was initialized to "SRD 5e Introduction".
        // Since no content was written before the first header, the introduction shouldn't be saved if it's empty.
        // So the first saved section is "Fireball"!
        let r1 = rows.next().unwrap().unwrap();
        let title1: String = r1.get(0).unwrap();
        let content1: String = r1.get(3).unwrap();
        assert_eq!(title1, "Fireball");
        assert_eq!(content1.trim(), "Fireball deals fire damage.");

        // Second row is "Magic Missile"
        let r2 = rows.next().unwrap().unwrap();
        let title2: String = r2.get(0).unwrap();
        let content2: String = r2.get(3).unwrap();
        assert_eq!(title2, "Magic Missile");
        assert_eq!(content2.trim(), "Magic Missile hits automatically.");

        // Clean up
        let _ = std::fs::remove_file(db_path);
    }
}
