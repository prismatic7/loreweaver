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
) -> Result<SystemContext, String> {
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

    // 3. Assemble System Prompt
    let system_prompt = format!(
        "You are an expert RPG Campaign Architect and Game Master assistant. \
        Help the user run, develop, and balance their campaign. \
        Answer questions regarding rules and lore accurately based on the campaign materials provided below.\n\n\
        --- RULES & LORE CONTEXT ---\n{}\n{}\n----------------------------\n\n\
        Respond in clean Markdown. Be creative and detail-oriented.",
        context_text, active_note_context
    );

    Ok(SystemContext {
        system_prompt,
        active_note_context,
    })
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
