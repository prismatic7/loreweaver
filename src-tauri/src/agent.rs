use crate::providers::llm::SystemContext;
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
    //    Gated on the world manifest's `bible` flag: when a world declares
    //    `bible: false`, bible conditioning is skipped (empty context).
    let bible_context = if world_bible_enabled(vault_path) {
        load_bible_context(vault_path)
    } else {
        String::new()
    };

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

    // 2c. Load the campaign persona (per-world voice override).
    let persona = load_campaign_persona(vault_path);
    let persona_opening = match &persona {
        Some(p) => p.clone(),
        None => {
            "You are an expert RPG Campaign Architect and Game Master assistant. \
        Help the user run, develop, and balance their campaign. \
        Answer questions regarding rules and lore accurately based on the campaign materials provided below."
                .to_string()
        }
    };

    // 3. Assemble System Prompt
    // Isolation boundary: worlds are vaults with separate databases, so this
    // is true by construction — but stating it makes the invariant explicit to
    // the model and guards against a future shared-context refactor.
    let system_prompt = format!(
        "{}\n\n\
        {}\n\
        --- RULES & LORE CONTEXT ---\n{}{}{}\n----------------------------\n\n\
        You have no memory of any other world or campaign. All context above \
        belongs to the current world only.\n\n\
        Respond in clean Markdown. Be creative and detail-oriented.",
        persona_opening,
        bible_context,
        context_text,
        active_note_context,
        memory_context
    );

    Ok(SystemContext {
        system_prompt,
        active_note_context,
    })
}

/// Returns whether bible conditioning is enabled for the world at `vault_path`.
///
/// Reads the world manifest's `bible` flag. Defaults to `true` when the
/// manifest is missing or unreadable (always-on injection preserved).
fn world_bible_enabled(vault_path: &str) -> bool {
    crate::worlds::load_manifest(vault_path)
        .map(|m| m.bible)
        .unwrap_or(true)
}

/// Loads the campaign persona from `<vault_path>/vault_config.json`.
///
/// The persona (`campaign_system`) is the world's voice: when set, it
/// replaces the hardcoded opening of the system prompt so the Muse speaks
/// as the campaign intends. Missing/unparseable config yields `None`
/// (default persona preserved).
fn load_campaign_persona(vault_path: &str) -> Option<String> {
    let config_file = std::path::Path::new(vault_path).join("vault_config.json");
    let content = std::fs::read_to_string(&config_file).ok()?;
    let settings: crate::VaultSettings = serde_json::from_str(&content).ok()?;
    settings
        .campaign_system
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Loads the world-level predictability override (0.0 = Firm, 1.0 = Wild)
/// from `vault_config.json`. Missing/unparseable config yields `None`, in
/// which case the global default applies.
pub(crate) fn load_world_firm_wild(vault_path: &str) -> Option<f64> {
    let config_file = std::path::Path::new(vault_path).join("vault_config.json");
    let content = std::fs::read_to_string(&config_file).ok()?;
    let settings: crate::VaultSettings = serde_json::from_str(&content).ok()?;
    settings.firm_wild.filter(|v| (0.0..=1.0).contains(v))
}

/// Reads the campaign bible files from `<vault_path>/bible/` and concatenates them
/// into a single fixed conditioning block.
///
/// The bible is ALWAYS-ON conditioning — it is injected verbatim into the system
/// prompt regardless of the query, so the Muse never generates off-tone even when
/// the query is vague. Missing files are skipped gracefully.
///
/// When the world manifest pins `bible_files`, only those files are read;
/// an empty pin list means the canon 8-file set is active.
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

    let pinned: Vec<String> = crate::worlds::load_manifest(vault_path)
        .map(|m| m.bible_files)
        .unwrap_or_default();

    let bible_dir = std::path::Path::new(vault_path).join("bible");
    let mut sections: Vec<String> = Vec::new();

    if pinned.is_empty() {
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
    } else {
        for file in &pinned {
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
    params: crate::providers::llm::SamplingParams,
) -> Result<String, String> {
    let agent = crate::providers::http_client();
    crate::providers::llm::generate_response(
        system_context,
        prompt,
        provider,
        model,
        api_key,
        base_url,
        allow_local,
        params,
        &agent,
    )
}

// ---------------------------------------------------------------------------
// Streaming agent loop (tools + reasoning + deltas)
// ---------------------------------------------------------------------------

/// Maximum number of tool-call rounds in a single turn (safety bound).
const MAX_TOOL_ROUNDS: usize = 4;

/// Maximum size of a note the agent may write (256 KiB). Bounds the blast
/// radius of a misbehaving model and keeps vault writes sane.
const MAX_AGENT_NOTE_BYTES: usize = 256 * 1024;

/// File names the agent may never overwrite (world/system configuration).
const PROTECTED_NOTE_NAMES: [&str; 2] = ["world.json", "vault_config.json"];

/// The tool definitions offered to the model, as JSON Schema objects.
pub fn tool_definitions() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "roll_dice",
                "description": "Roll dice using standard RPG notation (e.g. 2d6, 1d20+3, 3d6+1d4). Returns the individual rolls and the total.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "notation": { "type": "string", "description": "Dice notation, e.g. \"2d6+1\" or \"1d20\"" }
                    },
                    "required": ["notation"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "search_vault",
                "description": "Search the campaign vault for notes and rules matching a query. Returns titles and snippets.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search terms" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_note",
                "description": "Read the full content of a note by its id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Note id" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_notes",
                "description": "List all notes in the vault with their titles and ids.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "save_note",
                "description": "Create or update a note in the vault. Provide the note id (existing) or a new id, the path, title, and content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "path": { "type": "string" },
                        "title": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["id", "path", "title", "content"]
                }
            }
        }),
    ]
}

/// Executes a single tool call and returns its result text.
///
/// `conn` is the shared SQLite connection; `vault_path` is the active vault
/// root. All vault writes go through `validate_safe_path`.
pub fn execute_tool(
    conn: &rusqlite::Connection,
    vault_path: &str,
    name: &str,
    arguments: &str,
) -> Result<String, String> {
    let args: serde_json::Value =
        serde_json::from_str(arguments).unwrap_or(serde_json::Value::Object(Default::default()));

    match name {
        "roll_dice" => {
            let notation = args
                .get("notation")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if notation.trim().is_empty() {
                return Err("roll_dice: missing 'notation'".to_string());
            }
            Ok(crate::dice::roll(&notation))
        }
        "search_vault" => {
            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if query.trim().is_empty() {
                return Err("search_vault: missing 'query'".to_string());
            }
            let results = crate::search::hybrid_query(conn, &query, "all")
                .map_err(|e| format!("search_vault failed: {}", e))?;
            let mut lines = Vec::new();
            for r in results.iter().take(8) {
                lines.push(format!("[{}] {} — {}", r.r#type, r.title, r.snippet));
            }
            if lines.is_empty() {
                Ok("No results found.".to_string())
            } else {
                Ok(lines.join("\n"))
            }
        }
        "read_note" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() {
                return Err("read_note: missing 'id'".to_string());
            }
            let note = conn
                .query_row(
                    "SELECT title, content FROM notes WHERE id = ?1",
                    [&id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .map_err(|_| format!("read_note: no note with id '{}'", id))?;
            Ok(format!("# {}\n\n{}", note.0, note.1))
        }
        "list_notes" => {
            let notes = crate::db::load_all_notes(conn).map_err(|e| e.to_string())?;
            if notes.is_empty() {
                return Ok("No notes in the vault.".to_string());
            }
            let lines: Vec<String> = notes
                .iter()
                .map(|n| format!("{} — {}", n.id, n.title))
                .collect();
            Ok(lines.join("\n"))
        }
        "save_note" => {
            let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || path.is_empty() || title.is_empty() {
                return Err("save_note: 'id', 'path', and 'title' are required".to_string());
            }
            validate_agent_note_write(vault_path, &path, &content)?;
            let file_path = crate::validate_safe_path(vault_path, &path)?;
            // Preserve existing frontmatter: the agent only supplies body
            // content, so an update must not silently strip YAML metadata.
            let frontmatter = load_existing_frontmatter(conn, &path);
            crate::write_note_to_disk(&file_path, &content, &frontmatter)?;
            let _ = crate::db::upsert_note(conn, &path, &title, &content, &frontmatter, Some(&id));
            Ok(format!("Saved note '{}' to {}", title, path))
        }
        other => Err(format!("Unknown tool: {}", other)),
    }
}

/// Server-side write guards for agent `save_note` calls. These run BEFORE the
/// approval gate so a rejected write never reaches the user's screen.
///
/// Rejects:
/// - non-`.md` targets (the vault's note format; blocks `.canvas`, `.json`,
///   `.db`, and any other file the model might try to clobber),
/// - hidden/system paths (`.trash/`, `.noai`, `_assets/`, dotfiles),
/// - protected world-config files (`world.json`, `vault_config.json`),
/// - content over `MAX_AGENT_NOTE_BYTES`.
fn validate_agent_note_write(vault_path: &str, path: &str, content: &str) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    let lower = normalized.to_lowercase();

    if !lower.ends_with(".md") {
        return Err(format!(
            "save_note: only .md files may be written by the agent (got '{}')",
            path
        ));
    }
    for segment in normalized.split('/') {
        if segment.starts_with('.') || segment == "_assets" {
            return Err(format!(
                "save_note: hidden/system paths are not writable by the agent (got '{}')",
                path
            ));
        }
    }
    let file_name = normalized.rsplit('/').next().unwrap_or("");
    if PROTECTED_NOTE_NAMES.contains(&file_name) {
        return Err(format!(
            "save_note: '{}' is a protected world-config file and cannot be overwritten",
            file_name
        ));
    }
    if content.len() > MAX_AGENT_NOTE_BYTES {
        return Err(format!(
            "save_note: content exceeds the {} KiB agent write limit",
            MAX_AGENT_NOTE_BYTES / 1024
        ));
    }
    // The vault root itself must exist and be canonicalizable (validate_safe_path
    // enforces the boundary; this early check gives a clearer error).
    let _ = std::fs::canonicalize(vault_path)
        .map_err(|e| format!("save_note: vault path unavailable: {}", e))?;
    Ok(())
}

/// Loads the existing frontmatter for a note path, if any, so agent writes
/// preserve YAML metadata instead of wiping it.
fn load_existing_frontmatter(
    conn: &rusqlite::Connection,
    path: &str,
) -> std::collections::HashMap<String, serde_json::Value> {
    conn.query_row(
        "SELECT id FROM notes WHERE path = ?1",
        [path],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|note_id| {
        let mut stmt = conn
            .prepare("SELECT meta_key, meta_value FROM note_metadata WHERE note_id = ?1")
            .ok()?;
        let rows = stmt
            .query_map([note_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .ok()?;
        let mut map = std::collections::HashMap::new();
        for row in rows.flatten() {
            map.insert(row.0, serde_json::Value::String(row.1));
        }
        Some(map)
    })
    .unwrap_or_default()
}

/// Runs the streaming agent loop for one user turn.
///
/// Emits `AgentEvent`s through `emit`. The loop:
/// 1. Calls the provider with the full message history + tool definitions.
/// 2. Streams reasoning/deltas; collects tool calls.
/// 3. Executes tool calls, appends results, and repeats (bounded).
/// 4. Returns the final assistant text.
///
/// `history` is the prior chat turns (user/assistant), `context_items` are the
/// attached context blocks, and `active_note_id` is the currently open note.
///
/// Write tools (`save_note`) pause for explicit user approval: the loop emits
/// `AgentEvent::ToolApprovalRequired` and blocks on a per-tool-call oneshot
/// channel registered in `pending_approvals` under `(run_id, tool_call_id)`
/// until the frontend resolves it via `approve_agent_tool` /
/// `reject_agent_tool` (or `cancel_agent_stream`, which resolves it as
/// rejected). `cancel_flag` is checked between events so a cancelled turn
/// stops promptly.
pub fn run_agent_turn(
    conn: &rusqlite::Connection,
    vault_path: &str,
    system_prompt: &str,
    history: &[crate::ChatTurn],
    context_items: &[crate::ContextItem],
    active_note_id: Option<&str>,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    allow_local: bool,
    params: crate::providers::llm::SamplingParams,
    cancel_flag: &std::sync::atomic::AtomicBool,
    run_id: &str,
    pending_approvals: &std::sync::Arc<
        std::sync::Mutex<std::collections::HashMap<(String, String), tokio::sync::oneshot::Sender<bool>>>,
    >,
    emit: &mut dyn FnMut(crate::AgentEvent),
) -> Result<String, String> {
    let agent = crate::providers::http_client();
    let tools = tool_definitions();

    // Build the neutral message list: system, context, history, current turn.
    let mut messages: Vec<crate::providers::llm::ChatMessage> = Vec::new();

    // Context block (attached items + active note) as a user message.
    let mut context_text = String::new();
    for item in context_items {
        context_text.push_str(&format!(
            "\n--- CONTEXT: {} ({}) ---\n{}\n--- END CONTEXT ---\n",
            item.title, item.kind, item.content
        ));
    }
    if let Some(note_id) = active_note_id {
        if let Ok((title, content)) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ) {
            context_text.push_str(&format!(
                "\n--- CURRENTLY OPEN NOTE: {} ---\n{}\n--- END NOTE ---\n",
                title, content
            ));
        }
    }
    if !context_text.is_empty() {
        messages.push(crate::providers::llm::ChatMessage::user(format!(
            "The following context is attached to this conversation:\n{}",
            context_text
        )));
    }

    for turn in history {
        match turn.role.as_str() {
            "user" => messages.push(crate::providers::llm::ChatMessage::user(&turn.content)),
            "assistant" => messages.push(crate::providers::llm::ChatMessage::assistant(&turn.content)),
            _ => {}
        }
    }

    let mut full_text = String::new();
    let mut round = 0;

    loop {
        round += 1;
        let mut tool_calls: Vec<crate::providers::llm::ToolCallMsg> = Vec::new();
        let mut round_text = String::new();

        let result = crate::providers::llm::stream_response(
            system_prompt,
            &messages,
            provider,
            model,
            api_key,
            base_url,
            allow_local,
            params,
            &tools,
            &agent,
            &mut |event| match event {
                crate::providers::llm::StreamEvent::Reasoning(delta) => {
                    emit(crate::AgentEvent::Reasoning { delta });
                }
                crate::providers::llm::StreamEvent::Delta(text) => {
                    round_text.push_str(&text);
                    emit(crate::AgentEvent::Delta { text });
                }
                crate::providers::llm::StreamEvent::ToolCall { id, name, arguments } => {
                    tool_calls.push(crate::providers::llm::ToolCallMsg {
                        id: id.clone(),
                        name: name.clone(),
                        arguments: arguments.clone(),
                    });
                    emit(crate::AgentEvent::ToolCall { id, name, arguments });
                }
                crate::providers::llm::StreamEvent::Done(text) => {
                    round_text = text;
                }
                crate::providers::llm::StreamEvent::Error(message) => {
                    emit(crate::AgentEvent::Error { message });
                }
            },
        );

        match result {
            Ok(text) => {
                if !text.is_empty() {
                    full_text = text;
                }
            }
            Err(e) => {
                if round == 1 {
                    return Err(e);
                }
                emit(crate::AgentEvent::Error { message: e });
                break;
            }
        }

        if tool_calls.is_empty() {
            break;
        }

        // Record the assistant turn with tool calls, then execute them.
        messages.push(crate::providers::llm::ChatMessage::assistant_with_tool_calls(
            tool_calls.clone(),
        ));

        for tc in &tool_calls {
            // Write tools pause for explicit user approval. The approval
            // event carries a summary; the frontend resolves it via
            // `approve_agent_tool` / `reject_agent_tool` (or cancel, which
            // resolves it as rejected).
            if tc.name == "save_note" {
                let summary = summarize_save_note(&tc.arguments);
                // Register a fresh oneshot channel for this tool call so the
                // frontend can resolve it by `(run_id, tool_call_id)`.
                let (approval_tx, approval_rx) = tokio::sync::oneshot::channel::<bool>();
                {
                    let mut pending = pending_approvals
                        .lock()
                        .map_err(|_| "Approval registry poisoned".to_string())?;
                    pending.insert((run_id.to_string(), tc.id.clone()), approval_tx);
                }
                emit(crate::AgentEvent::ToolApprovalRequired {
                    approval: crate::PendingToolApproval {
                        run_id: run_id.to_string(),
                        tool_call_id: tc.id.clone(),
                        name: tc.name.clone(),
                        arguments: tc.arguments.clone(),
                        summary,
                    },
                });
                let approved = match approval_rx.blocking_recv() {
                    Ok(decision) => decision,
                    Err(_) => false,
                };
                // The channel is consumed; drop the registry entry so a stale
                // approve/reject for this call is a no-op.
                {
                    let mut pending = pending_approvals
                        .lock()
                        .map_err(|_| "Approval registry poisoned".to_string())?;
                    pending.remove(&(run_id.to_string(), tc.id.clone()));
                }
                if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                if !approved {
                    let result_text = "User rejected this write. Do not retry it; continue without saving.";
                    emit(crate::AgentEvent::ToolResult {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        result: result_text.to_string(),
                    });
                    messages.push(crate::providers::llm::ChatMessage::tool(
                        &tc.id,
                        result_text,
                    ));
                    continue;
                }
            }

            let result = execute_tool(conn, vault_path, &tc.name, &tc.arguments);
            let result_text = match result {
                Ok(text) => text,
                Err(e) => format!("Error: {}", e),
            };
            emit(crate::AgentEvent::ToolResult {
                id: tc.id.clone(),
                name: tc.name.clone(),
                result: result_text.clone(),
            });
            messages.push(crate::providers::llm::ChatMessage::tool(&tc.id, result_text));
        }

        if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }

        if round >= MAX_TOOL_ROUNDS {
            break;
        }
    }

    emit(crate::AgentEvent::Done {
        text: full_text.clone(),
    });
    Ok(full_text)
}

/// Builds a short human-readable summary of a `save_note` call for the
/// approval banner (path, title, content size).
fn summarize_save_note(arguments: &str) -> String {
    let args: serde_json::Value =
        serde_json::from_str(arguments).unwrap_or(serde_json::Value::Object(Default::default()));
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("?");
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    format!(
        "Write note '{}' to {} ({} chars)",
        title,
        path,
        content.chars().count()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worlds::{default_manifest, load_manifest, save_manifest};

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

    #[test]
    fn test_bible_gating_disabled_when_manifest_bible_false() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        let bible_dir = vault.join("bible");
        std::fs::create_dir_all(&bible_dir).unwrap();
        std::fs::write(bible_dir.join("TONE.md"), "Grim, cosmic horror.").unwrap();

        // No manifest yet → bible enabled by default.
        assert!(world_bible_enabled(vault.to_str().unwrap()));

        // Write a manifest with bible: false → bible disabled.
        std::fs::write(
            vault.join("world.json"),
            r#"{ "id": "no-bible", "name": "No Bible", "bible": false }"#,
        )
        .unwrap();
        assert!(!world_bible_enabled(vault.to_str().unwrap()));

        // build_system_context must skip bible injection when disabled.
        let db_path = vault.join("test.db");
        let conn = crate::db::init_db(db_path.to_str().unwrap()).unwrap();
        let context = build_system_context(&conn, "hello", None, vault.to_str().unwrap()).unwrap();
        assert!(
            !context.system_prompt.contains("CAMPAIGN BIBLE"),
            "bible should be skipped when manifest bible=false"
        );
    }

    #[test]
    fn test_load_bible_context_honours_pinned_files() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        let bible_dir = vault.join("bible");
        std::fs::create_dir_all(&bible_dir).unwrap();
        std::fs::write(bible_dir.join("TONE.md"), "Grim, cosmic horror.").unwrap();
        std::fs::write(bible_dir.join("RULES.md"), "Sanity erodes.").unwrap();
        std::fs::write(bible_dir.join("PEOPLE.md"), "The Keeper of the Gate.").unwrap();

        // Unpinned (empty) → canon set: all three files present.
        let context = load_bible_context(vault.to_str().unwrap());
        assert!(context.contains("[TONE.md]"));
        assert!(context.contains("[RULES.md]"));
        assert!(context.contains("[PEOPLE.md]"));

        // Pin only TONE.md → others excluded.
        std::fs::write(
            vault.join("world.json"),
            r#"{ "id": "pinned", "name": "Pinned", "bible_files": ["TONE.md"] }"#,
        )
        .unwrap();
        let context = load_bible_context(vault.to_str().unwrap());
        assert!(context.contains("[TONE.md]"));
        assert!(!context.contains("[RULES.md]"), "unpinned file should be excluded");
        assert!(!context.contains("[PEOPLE.md]"), "unpinned file should be excluded");

        // Pin a file that doesn't exist → gracefully skipped.
        std::fs::write(
            vault.join("world.json"),
            r#"{ "id": "pinned", "name": "Pinned", "bible_files": ["TONE.md", "MISSING.md"] }"#,
        )
        .unwrap();
        let context = load_bible_context(vault.to_str().unwrap());
        assert!(context.contains("[TONE.md]"));
        assert!(!context.contains("[MISSING.md]"), "missing pinned file should be skipped");
    }

    #[test]
    fn test_save_manifest_preserves_unrelated_keys() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(
            vault.join("world.json"),
            r#"{ "id": "w", "name": "W", "custom_field": "keep-me" }"#,
        )
        .unwrap();

        let mut m = default_manifest("w");
        m.bible_files = vec!["TONE.md".to_string()];
        save_manifest(vault.to_str().unwrap(), &m).unwrap();

        let on_disk = std::fs::read_to_string(vault.join("world.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(parsed["custom_field"], "keep-me", "unrelated key should survive");
        assert_eq!(parsed["bible_files"][0], "TONE.md");
        // Round-trip through load_manifest.
        let loaded = load_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(loaded.bible_files, vec!["TONE.md".to_string()]);
    }

    #[test]
    fn test_build_system_context_uses_campaign_persona_when_set() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        let db_path = vault.join("test.db");
        let conn = crate::db::init_db(db_path.to_str().unwrap()).unwrap();

        // No config → default persona.
        let context = build_system_context(&conn, "hello", None, vault.to_str().unwrap()).unwrap();
        assert!(
            context.system_prompt.contains("expert RPG Campaign Architect"),
            "default persona should be used when no vault_config.json exists"
        );

        // Write a config with a persona → it replaces the default opening.
        std::fs::write(
            vault.join("vault_config.json"),
            r#"{ "campaign_system": "You are the Keeper of the Gate, a sardonic cosmic-horror narrator." }"#,
        )
        .unwrap();
        let context = build_system_context(&conn, "hello", None, vault.to_str().unwrap()).unwrap();
        assert!(
            context
                .system_prompt
                .contains("Keeper of the Gate, a sardonic cosmic-horror narrator"),
            "campaign persona should appear in the system prompt"
        );
        assert!(
            !context.system_prompt.contains("expert RPG Campaign Architect"),
            "hardcoded opening should be replaced when persona is set"
        );
    }

    #[test]
    fn test_build_system_context_states_world_isolation() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        let db_path = vault.join("test.db");
        let conn = crate::db::init_db(db_path.to_str().unwrap()).unwrap();

        let context = build_system_context(&conn, "hello", None, vault.to_str().unwrap()).unwrap();
        assert!(
            context
                .system_prompt
                .contains("You have no memory of any other world or campaign"),
            "isolation boundary should be present in the system prompt"
        );
    }

    #[test]
    fn test_load_campaign_persona_graceful_when_unset_or_unparseable() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();
        assert!(
            load_campaign_persona(vault.to_str().unwrap()).is_none(),
            "missing config should yield None"
        );

        std::fs::write(vault.join("vault_config.json"), "not json").unwrap();
        assert!(
            load_campaign_persona(vault.to_str().unwrap()).is_none(),
            "unparseable config should yield None"
        );

        std::fs::write(
            vault.join("vault_config.json"),
            r#"{ "campaign_system": "   " }"#,
        )
        .unwrap();
        assert!(
            load_campaign_persona(vault.to_str().unwrap()).is_none(),
            "blank persona should yield None"
        );
    }

    #[test]
    fn test_load_world_firm_wild_cascade_values() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path();

        // No config → None (global default applies).
        assert_eq!(load_world_firm_wild(vault.to_str().unwrap()), None);

        // Valid override → Some(value).
        std::fs::write(
            vault.join("vault_config.json"),
            r#"{ "firm_wild": 0.3 }"#,
        )
        .unwrap();
        assert_eq!(
            load_world_firm_wild(vault.to_str().unwrap()),
            Some(0.3),
            "world override should be honoured"
        );

        // Out-of-range values are rejected (fall back to global).
        std::fs::write(
            vault.join("vault_config.json"),
            r#"{ "firm_wild": 1.7 }"#,
        )
        .unwrap();
        assert_eq!(
            load_world_firm_wild(vault.to_str().unwrap()),
            None,
            "out-of-range override should be ignored"
        );

        // Unparseable config → None.
        std::fs::write(vault.join("vault_config.json"), "not json").unwrap();
        assert_eq!(load_world_firm_wild(vault.to_str().unwrap()), None);
    }

    fn test_conn(vault: &std::path::Path) -> rusqlite::Connection {
        let db_path = vault.join("test.db");
        crate::db::init_db(db_path.to_str().unwrap()).unwrap()
    }

    #[test]
    fn test_execute_tool_roll_dice() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let result = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "roll_dice",
            r#"{ "notation": "2d6" }"#,
        )
        .unwrap();
        assert!(result.contains("2d6"), "result should echo notation: {}", result);
    }

    #[test]
    fn test_execute_tool_roll_dice_missing_notation() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let err = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "roll_dice",
            "{}",
        )
        .unwrap_err();
        assert!(err.contains("missing 'notation'"), "unexpected error: {}", err);
    }

    #[test]
    fn test_execute_tool_list_notes_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let result = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "list_notes",
            "{}",
        )
        .unwrap();
        assert_eq!(result, "No notes in the vault.");
    }

    #[test]
    fn test_execute_tool_save_and_read_note() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("Worldbuilding")).unwrap();
        let conn = test_conn(tmp.path());
        let vault = tmp.path().to_str().unwrap();

        let saved = execute_tool(
            &conn,
            vault,
            "save_note",
            r#"{ "id": "n1", "path": "Worldbuilding/Goblin.md", "title": "Goblin", "content": "A small green creature." }"#,
        )
        .unwrap();
        assert!(saved.contains("Saved note 'Goblin'"), "unexpected: {}", saved);

        let read = execute_tool(&conn, vault, "read_note", r#"{ "id": "n1" }"#).unwrap();
        assert!(read.contains("Goblin"), "read should include title: {}", read);
        assert!(read.contains("small green creature"), "read should include content: {}", read);
    }

    #[test]
    fn test_execute_tool_read_note_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let err = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "read_note",
            r#"{ "id": "nope" }"#,
        )
        .unwrap_err();
        assert!(err.contains("no note with id 'nope'"), "unexpected: {}", err);
    }

    #[test]
    fn test_execute_tool_unknown() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let err = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "teleport",
            "{}",
        )
        .unwrap_err();
        assert!(err.contains("Unknown tool: teleport"), "unexpected: {}", err);
    }

    #[test]
    fn test_execute_tool_save_note_rejects_unsafe_path() {
        let tmp = tempfile::tempdir().unwrap();
        let conn = test_conn(tmp.path());
        let err = execute_tool(
            &conn,
            tmp.path().to_str().unwrap(),
            "save_note",
            r#"{ "id": "n1", "path": "../escape.md", "title": "Escape", "content": "x" }"#,
        )
        .unwrap_err();
        assert!(
            err.contains("outside")
                || err.contains("safe")
                || err.contains("hidden/system"),
            "unsafe path should be rejected: {}",
            err
        );
    }
}
