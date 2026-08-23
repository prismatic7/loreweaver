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
    let system_prompt = format!(
        "{}\n\n\
        {}\n\
        --- RULES & LORE CONTEXT ---\n{}{}{}\n----------------------------\n\n\
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
}
