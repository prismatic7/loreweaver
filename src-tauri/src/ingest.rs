use crate::db;
use crate::search;
use rusqlite::params;
use uuid::Uuid;

/// SRD Ingestion & Parsing Engine
///
/// Converts raw Markdown system reference documents (SRD) or campaign rulebooks into structured database
/// records and vector embeddings for hybrid retrieval.
///
/// ### Core Architectural Concepts:
/// - **SRD Ingestion & Parsing Engine**: Automated pipeline for turning monolithic markdown rulebooks into
///   discrete queryable rules and searchable vector chunks stored in SQLite.
/// - **Header-Based Chunk Split Parsing (`#`, `##`, `###`)**: Line-by-line scanning detects Markdown header syntax
///   (`#`, `##`, `###`). The parser partitions continuous text into distinct sections based on header boundaries,
///   using the header text as the rule title. This creates granular topic entries (e.g., individual spell or action rules)
///   rather than storing unsegmented multi-page documents.
/// - **Chunk Overlapping Windows**: Each parsed section is segmented into vector search chunks using a sliding window
///   approach (`search::chunk_text(content, 120, 20)`). Specifying 120 words per chunk with a 20-word overlap preserves
///   context across boundaries, preventing vital rules or keywords from being cut off mid-sentence.
/// - **Database Index Embedding Insertion**: Text chunks are passed to `search::generate_embedding(...)` to derive
///   384-dimensional vector representations. The vector and chunk text are inserted into SQLite (`rule_chunks`). If
///   embedding generation fails, a zero-filled vector fallback is saved to ensure database consistency without losing chunk records.

/// Ingests raw markdown text content directly, parsing header-delimited sections into structured rule entries.
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

    // 1. Header-Based Chunk Split Parsing:
    // Scans markdown line-by-line. When a header line starting with `#`, `##`, or `###` is encountered,
    // the accumulated text lines in `current_body` are finalized and saved as a discrete rule entry.
    for line in content.lines() {
        if line.starts_with("# ") || line.starts_with("## ") || line.starts_with("### ") {
            // Save the previous section
            let section_text = current_body.join("\n");
            if !section_text.trim().is_empty() {
                save_rule_entry(&conn, &current_title, category, source, &section_text)?;
            }
            current_body.clear();

            // Set new section title from header text
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

    // Invalidate search engine memory caches so new rules take effect immediately
    search::invalidate_cache();
    println!("SRD text content ingestion complete!");
    Ok(())
}

/// Helper function to save a single parsed rule section and compute its vector embedding chunks.
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

    // 2. Chunk Overlapping Windows & 3. Database Index Embedding Insertion:
    // Break section text into 120-word windows with 20-word overlap (`search::chunk_text`).
    // Generate 384-dimensional embeddings for each chunk and insert into `rule_chunks`.
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
                // Zero-filled fallback vector insertion to ensure record consistency
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
