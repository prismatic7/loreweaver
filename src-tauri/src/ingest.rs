use crate::db;
use crate::search;
use rusqlite::params;
use uuid::Uuid;

/// Ingests raw markdown text content directly.
pub fn ingest_markdown_text(
    db_path: &str,
    content: &str,
    category: &str,
    source: &str,
) -> Result<(), String> {
    println!(
        "Ingesting SRD content (Category: {}, Source: {})",
        category, source
    );
    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;

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
    conn.execute(
        "INSERT INTO rules (id, title, category, source, content) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![rule_id, title, category, source, content],
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
