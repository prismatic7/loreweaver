use crate::providers::llm::{self, SystemContext};
use crate::search;

/// AI Agent & RAG Context Orchestration
/// Blends FTS5 matches and active document buffers into structured system prompt boundaries.
/// Dispatches chat payloads to provider implementations in `crate::providers`.

/// Builds the system prompt and active-note context while still holding the DB lock.
///
/// The returned `SystemContext` can be moved into a blocking task so the database
/// mutex is not held across HTTP calls.
pub fn build_system_context(
    conn: &rusqlite::Connection,
    prompt: &str,
    active_note_id: Option<&str>,
    vault_path: &str,
) -> Result<SystemContext, String> {
    // 0. Load the campaign bible as a FIXED conditioning block (always-on, not
    //    retrieved-by-similarity). This is the world's voice, tone, and canon.
    let bible_context = load_bible_context(vault_path);

    // 1. Gather Context via Hybrid Search (RAG)
    let context_results = match search::hybrid_query(conn, prompt, "all") {
        Ok(results) => results,
        Err(e) => {
            eprintln!("RAG context search failed: {:?}", e);
            Vec::new()
        }
    };

    let mut context_text = String::new();
    for (idx, result) in context_results.iter().take(4).enumerate() {
        context_text.push_str(&format!(
            "\nContext Segment {} (Source: {}, Type: {}):\n{}\n",
            idx + 1,
            result.title,
            result.r#type,
            result.snippet
        ));
    }

    // 2. Fetch Active Note Content (if open)
    let mut active_note_context = String::new();
    if let Some(note_id) = active_note_id {
        if let Ok((title, content)) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ) {
            active_note_context = format!(
                "\nCurrently Open Note sheet (Title: {}):\n{}\n",
                title, content
            );
        }
    }

    // 2b. Fetch persistent session memory facts (vault-scoped).
    let mut memory_context = String::new();
    if let Ok(facts) = crate::db::list_session_memory(conn) {
        if !facts.is_empty() {
            let mut lines = Vec::new();
            for (id, fact, category, _ts) in facts.iter().take(20) {
                lines.push(format!("- [{}] {} (id: {})", category, fact, id));
            }
            memory_context = format!(
                "\n--- PERSISTENT CAMPAIGN MEMORY (facts you have learned) ---\n{}\n--------------------------------------------------\n",
                lines.join("\n")
            );
        }
    }

    // 3. Assemble System Prompt
    let system_prompt = format!(
        "You are an expert RPG Campaign Architect and Game Master assistant. \
        Help the user run, develop, and balance their campaign. \
        Answer questions regarding rules and lore accurately based on the campaign materials provided below.\n\n\
        {}\n\
        --- RULES & LORE CONTEXT ---\n{}\n{}\n{}\n----------------------------\n\n\
        Respond in clean Markdown. Be creative and detail-oriented.",
        bible_context, context_text, active_note_context, memory_context
    );

    Ok(SystemContext {
        system_prompt,
        active_note_context,
    })
}

/// Reads the campaign bible files from `<vault_path>/bible/` and concatenates them
/// into a single fixed conditioning block.
///
/// The bible is ALWAYS-ON conditioning — it is injected verbatim into the system
/// prompt regardless of the query, so the Muse never generates off-tone even when
/// the query is vague. Missing files are skipped gracefully.
fn load_bible_context(vault_path: &str) -> String {
    const BIBLE_FILES: [&str; 8] = [
        "TONE.md",
        "TOUCHSTONES.md",
        "THE_PLAN.md",
        "CONSPIRACY.md",
        "PEOPLE.md",
        "PLACES.md",
        "RULES.md",
        "SESSION_LOG.md",
    ];

    let bible_dir = std::path::Path::new(vault_path).join("bible");
    let mut sections: Vec<String> = Vec::new();

    for file in BIBLE_FILES {
        let path = bible_dir.join(file);
        match std::fs::read_to_string(&path) {
            Ok(contents) => {
                let trimmed = contents.trim();
                if !trimmed.is_empty() {
                    sections.push(format!("[{}]\n{}", file, trimmed));
                }
            }
            Err(_) => {
                // Skip missing/unreadable bible files gracefully.
                continue;
            }
        }
    }

    if sections.is_empty() {
        return String::new();
    }

    format!(
        "--- CAMPAIGN BIBLE (ALWAYS-ON CONDITIONING — the world's voice, tone, and canon) ---\n{}\n--------------------------------------------------------------------\n",
        sections.join("\n\n")
    )
}

/// Orchestrates a call to the configured LLM backend using pre-computed context.
///
/// This function performs blocking HTTP I/O and must be invoked inside
/// `tokio::task::spawn_blocking` (or `tauri::async_runtime::spawn_blocking`) so the
/// async runtime is not blocked.
pub fn generate_response(
    system_context: &SystemContext,
    prompt: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    allow_local: bool,
) -> Result<String, String> {
    let agent = crate::providers::http_client();
    llm::generate_response(
        system_context,
        prompt,
        provider,
        model,
        api_key,
        base_url,
        allow_local,
        &agent,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_bible_context_injects_bible_when_files_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let bible_dir = tmp.path().join("bible");
        std::fs::create_dir_all(&bible_dir).unwrap();
        std::fs::write(bible_dir.join("TONE.md"), "Grim, cosmic horror. Hope is a lie.").unwrap();
        std::fs::write(bible_dir.join("RULES.md"), "Sanity erodes on failed checks.").unwrap();

        let context = load_bible_context(tmp.path().to_str().unwrap());
        assert!(
            context.contains("CAMPAIGN BIBLE"),
            "bible header should be present"
        );
        assert!(
            context.contains("[TONE.md]"),
            "TONE.md section header should be present"
        );
        assert!(
            context.contains("Grim, cosmic horror"),
            "TONE.md contents should be injected"
        );
        assert!(
            context.contains("[RULES.md]"),
            "RULES.md section header should be present"
        );
        assert!(
            context.contains("Sanity erodes on failed checks"),
            "RULES.md contents should be injected"
        );
    }

    #[test]
    fn test_load_bible_context_empty_when_no_files() {
        let tmp = tempfile::tempdir().unwrap();
        let context = load_bible_context(tmp.path().to_str().unwrap());
        assert!(context.is_empty(), "no bible files should yield empty context");
    }

    #[test]
    fn test_load_bible_context_skips_missing_files() {
        let tmp = tempfile::tempdir().unwrap();
        let bible_dir = tmp.path().join("bible");
        std::fs::create_dir_all(&bible_dir).unwrap();
        // Only one of the eight files exists.
        std::fs::write(bible_dir.join("PEOPLE.md"), "The Keeper of the Gate.").unwrap();

        let context = load_bible_context(tmp.path().to_str().unwrap());
        assert!(context.contains("[PEOPLE.md]"));
        assert!(!context.contains("[TONE.md]"), "missing file should be skipped");
        assert!(!context.contains("[CONSPIRACY.md]"), "missing file should be skipped");
    }
}
