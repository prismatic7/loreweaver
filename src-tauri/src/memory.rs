//! # World-Scoped Memory Extraction (`memory.rs`)
//!
//! Turns chat transcripts into durable `session_memory` facts for the *active*
//! world only. Worlds are vaults — each has its own `loreweaver_vault.db`, so
//! scoping is guaranteed by using the active connection passed in, never a
//! path-constructed one.
//!
//! Extraction is **best-effort and silent**: a failed extraction pass must
//! never break the chat turn that triggered it.

use rusqlite::Connection;
use serde_json::Value;

/// Hard cap on stored facts per world. Oldest facts are evicted beyond this.
pub const MAX_FACTS: usize = 200;

/// Normalises a fact for duplicate comparison: lowercase, trim, collapse
/// internal whitespace runs.
pub fn normalise(s: &str) -> String {
    s.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// True when `new` is a duplicate of any fact in `existing` (both normalised).
///
/// Duplicate means: exact equality, or one contains the other with >= 90%
/// overlap (measured on the shorter string). Pragmatic, not fancy.
pub fn is_duplicate(new: &str, existing: &[String]) -> bool {
    let n = normalise(new);
    if n.is_empty() {
        return true;
    }
    let n_len = n.chars().count();
    existing.iter().any(|e| {
        let e = normalise(e);
        if e.is_empty() {
            return false;
        }
        if e == n {
            return true;
        }
        // Containment either direction, with a 90% overlap floor.
        let (short, long) = if n_len <= e.chars().count() {
            (n.as_str(), e.as_str())
        } else {
            (e.as_str(), n.as_str())
        };
        if long.contains(short) {
            let short_len = short.chars().count();
            short_len > 0 && (short_len as f64) / (long.chars().count() as f64) >= 0.9
        } else {
            false
        }
    })
}

/// Parses the extraction LLM's response into `(fact, category)` pairs.
///
/// Tolerates: clean JSON, JSON inside markdown fences, prose wrapping the
/// JSON object, and a plain `- ` bullet fallback when JSON parsing fails.
pub fn parse_extraction_response(text: &str) -> Vec<(String, String)> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    // Try to locate a JSON object (possibly inside fences or prose).
    if let Some(start) = trimmed.find('{') {
        if let Some(end_rel) = trimmed[start..].rfind('}') {
            let candidate = &trimmed[start..start + end_rel + 1];
            if let Ok(value) = serde_json::from_str::<Value>(candidate) {
                if let Some(facts) = value.get("facts").and_then(|f| f.as_array()) {
                    let mut out = Vec::new();
                    for item in facts {
                        if let (Some(fact), Some(cat)) = (
                            item.get("fact").and_then(|f| f.as_str()),
                            item.get("category").and_then(|c| c.as_str()),
                        ) {
                            let fact = fact.trim();
                            if !fact.is_empty() {
                                out.push((fact.to_string(), cat.trim().to_string()));
                            }
                        }
                    }
                    return out;
                }
            }
        }
    }

    // Fallback: `- ` (or `• `) bullet lines, category general. Non-bullet
    // prose is ignored — the bullet form is the expected degraded mode.
    trimmed
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let fact = line
                .strip_prefix("- ")
                .or_else(|| line.strip_prefix("• "))
                .map(str::trim)?;
            if fact.is_empty() || fact.starts_with("```") {
                None
            } else {
                Some((fact.to_string(), "general".to_string()))
            }
        })
        .collect()
}

/// Inserts facts, skipping duplicates against existing memory. Returns the
/// number of new facts inserted. After insertion, evicts beyond `MAX_FACTS`.
pub fn insert_facts_deduped(
    conn: &Connection,
    facts: Vec<(String, String)>,
) -> Result<usize, String> {
    if facts.is_empty() {
        return Ok(0);
    }

    let mut existing = crate::db::list_session_memory(conn)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(_, fact, _, _)| fact)
        .collect::<Vec<_>>();

    let mut inserted = 0usize;
    for (fact, category) in facts {
        if is_duplicate(&fact, &existing) {
            continue;
        }
        let id =
            crate::db::insert_session_memory(conn, &fact, &category).map_err(|e| e.to_string())?;
        existing.push(fact);
        inserted += 1;
        // Keep `id` used — insert_session_memory returns the new id.
        let _ = id;
    }

    if inserted > 0 {
        // Evict oldest beyond the cap.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM session_memory", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if count > MAX_FACTS as i64 {
            conn.execute(
                "DELETE FROM session_memory WHERE id NOT IN \
                 (SELECT id FROM session_memory ORDER BY created_at DESC LIMIT ?1)",
                rusqlite::params![MAX_FACTS as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(inserted)
}

/// Calls the LLM to extract durable facts from a chat transcript.
///
/// Must be invoked inside `spawn_blocking` (blocking HTTP I/O). Returns
/// `(fact, category)` pairs — possibly empty when nothing is worth remembering.
pub fn extract_facts(
    transcript: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    allow_local: bool,
    params: crate::providers::llm::SamplingParams,
    agent: &ureq::Agent,
) -> Result<Vec<(String, String)>, String> {
    let system_prompt = "You are a campaign memory recorder for a tabletop RPG. \
        From the following GM/agent exchange, extract only durable, useful facts \
        worth remembering across sessions — NPCs, factions, decisions made, plot \
        threads opened or closed, world state changes. Skip chit-chat, \
        pleasantries, and anything already implied by campaign notes. \
        Return JSON only: {\"facts\": [{\"fact\": \"...\", \"category\": \"npc|faction|decision|thread|world\"}]}. \
        If nothing is worth remembering, return {\"facts\": []}.";

    let user_prompt = format!(
        "--- TRANSCRIPT ---\n{}\n------------------\n\nExtract durable facts now.",
        transcript
    );

    let system_context = crate::providers::llm::SystemContext {
        system_prompt: system_prompt.to_string(),
        active_note_context: String::new(),
    };

    let raw = crate::providers::llm::generate_response(
        &system_context,
        &user_prompt,
        provider,
        model,
        api_key,
        base_url,
        allow_local,
        params,
        agent,
    )?;

    Ok(parse_extraction_response(&raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalise_collapses_case_and_whitespace() {
        assert_eq!(normalise("  The  Red  Dragon "), "the red dragon");
        assert_eq!(normalise("The Red Dragon"), "the red dragon");
    }

    #[test]
    fn test_is_duplicate_variants() {
        let existing = vec![
            "The party met the Red Dragon outside the old keep".to_string(),
            "Queen Anara rules Eldoria".to_string(),
        ];
        // Exact (modulo case/whitespace).
        assert!(is_duplicate(
            "  THE RED   DRAGON ",
            &["The Red Dragon".to_string()]
        ));
        // Substring with >= 90% overlap (adding one char: 49/50 = 98%).
        assert!(is_duplicate(
            "The party met the Red Dragon outside the old keep!",
            &existing
        ));
        // Below the 90% overlap bar — adds real information, not a dup.
        assert!(!is_duplicate(
            "The party met the Red Dragon outside the old keep and it was tense",
            &existing
        ));
        // Distinct.
        assert!(!is_duplicate("Goblins raid the northern pass", &existing));
        // Empty is always duplicate (never store blank).
        assert!(is_duplicate("", &existing));
    }

    #[test]
    fn test_parse_clean_json() {
        let text = r#"{"facts":[{"fact":"Queen Anara rules Eldoria","category":"faction"},{"fact":"The Red Dragon was slain","category":"world"}]}"#;
        let facts = parse_extraction_response(text);
        assert_eq!(facts.len(), 2);
        assert_eq!(
            facts[0],
            (
                "Queen Anara rules Eldoria".to_string(),
                "faction".to_string()
            )
        );
        assert_eq!(
            facts[1],
            ("The Red Dragon was slain".to_string(), "world".to_string())
        );
    }

    #[test]
    fn test_parse_fenced_json() {
        let text =
            "```json\n{\"facts\":[{\"fact\":\"NPC Zorak joined\",\"category\":\"npc\"}]}\n```";
        let facts = parse_extraction_response(text);
        assert_eq!(facts.len(), 1);
        assert_eq!(
            facts[0],
            ("NPC Zorak joined".to_string(), "npc".to_string())
        );
    }

    #[test]
    fn test_parse_prose_wrapped_json() {
        let text = "Here are the facts I found:\n{\"facts\":[{\"fact\":\"A decision was made\",\"category\":\"decision\"}]}\nHope that helps!";
        let facts = parse_extraction_response(text);
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].0, "A decision was made");
    }

    #[test]
    fn test_parse_bullet_fallback() {
        let text = "- The party is heading north\n- Goblins control the pass\n\n```\nignored\n```";
        let facts = parse_extraction_response(text);
        assert!(facts.len() >= 2);
        assert_eq!(
            facts[0],
            (
                "The party is heading north".to_string(),
                "general".to_string()
            )
        );
        // No fact should be the fence marker.
        assert!(!facts.iter().any(|(f, _)| f.contains("```")));
    }

    #[test]
    fn test_parse_empty_and_garbage() {
        assert!(parse_extraction_response("").is_empty());
        assert!(parse_extraction_response("Nothing worth remembering here.").is_empty());
        assert!(parse_extraction_response("```\n{\"facts\":[]}\n```").is_empty());
    }

    #[test]
    fn test_insert_facts_deduped() {
        let dir = std::env::temp_dir();
        let db_path = dir.join(format!("lw_mem_dedup_{}.db", std::process::id()));
        let conn = crate::db::init_db(&db_path.to_string_lossy()).unwrap();
        let facts = vec![
            (
                "Queen Anara rules Eldoria".to_string(),
                "faction".to_string(),
            ),
            ("The Red Dragon was slain".to_string(), "world".to_string()),
            (
                "Queen Anara rules Eldoria".to_string(),
                "faction".to_string(),
            ), // dup
        ];
        let inserted = insert_facts_deduped(&conn, facts).unwrap();
        assert_eq!(inserted, 2);
        let stored = crate::db::list_session_memory(&conn).unwrap();
        assert_eq!(stored.len(), 2);
        drop(conn);
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn test_insert_facts_caps_at_max() {
        let dir = std::env::temp_dir();
        let db_path = dir.join(format!("lw_mem_cap_{}.db", std::process::id()));
        let conn = crate::db::init_db(&db_path.to_string_lossy()).unwrap();
        // Insert MAX_FACTS + 10 distinct facts. Zero-padded so no fact is a
        // substring of another (e.g. "Fact 1" ⊂ "Fact 10" would dedupe).
        let mut facts = Vec::new();
        for i in 0..MAX_FACTS + 10 {
            facts.push((format!("Fact number {:04}", i), "general".to_string()));
        }
        let inserted = insert_facts_deduped(&conn, facts).unwrap();
        assert_eq!(inserted, MAX_FACTS + 10);
        let stored = crate::db::list_session_memory(&conn).unwrap();
        assert_eq!(stored.len(), MAX_FACTS);
        drop(conn);
        let _ = std::fs::remove_file(&db_path);
    }
}
