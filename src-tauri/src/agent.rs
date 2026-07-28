use crate::search;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// AI Agent & RAG Context Orchestration
/// Blends FTS5 matches and active document buffers into structured system prompt boundaries.
/// Dispatches chat payloads to Ollama, OpenAI, Gemini, or Anthropic.

#[derive(Deserialize, Serialize, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Orchestrates local RAG, fetches matching context vectors, and calls the LLM provider.
pub fn generate_response(
    conn: &rusqlite::Connection,
    prompt: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    active_note_id: Option<&str>,
) -> Result<String, String> {
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

    // 4. Call LLM API Provider
    match provider {
        "ollama" => {
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("http://localhost:11434")
                .trim()
                .trim_end_matches('/');
            call_ollama(model, &system_prompt, prompt, base)
        }
        "openai" | "openai-compatible" | "openrouter" | "copilot" | "z-ai" | "kilo"
        | "huggingface" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or(format!("{} API key missing", provider))?;
            let default_url = match provider {
                "openrouter" => "https://openrouter.ai/api",
                "copilot" => "https://api.githubcopilot.com",
                "z-ai" => "https://api.z.ai/api",
                "kilo" => "https://api.kilo.ai/api",
                "huggingface" => "https://api-inference.huggingface.co",
                _ => "https://api.openai.com",
            };
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or(default_url)
                .trim()
                .trim_end_matches('/');
            call_openai_compatible(model, key, &system_prompt, prompt, base, provider)
        }
        "gemini" => {
            let key = api_key.ok_or("Gemini API key missing")?;
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("https://generativelanguage.googleapis.com")
                .trim()
                .trim_end_matches('/');
            call_gemini(model, key, &system_prompt, prompt, base)
        }
        "anthropic" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("Anthropic API key missing")?;
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("https://api.anthropic.com")
                .trim()
                .trim_end_matches('/');
            call_anthropic(model, key, &system_prompt, prompt, base)
        }
        other => Err(format!("Unsupported LLM provider: {}", other)),
    }
}

fn call_ollama(model: &str, system: &str, prompt: &str, base_url: &str) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url);
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });

    println!("Calling Ollama API (Model: {}) at {}...", model, url);
    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .send_json(body)
        .map_err(|e| {
            format!(
                "Ollama request failed: {:?}. Is Ollama running at {}?",
                e, base_url
            )
        })?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Ollama JSON: {:?}", e))?;

    let content = res_json["message"]["content"]
        .as_str()
        .ok_or("Ollama returned empty response")?;

    Ok(content.to_string())
}

fn call_openai_compatible(
    model: &str,
    api_key: &str,
    system: &str,
    prompt: &str,
    base_url: &str,
    provider: &str,
) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", base_url);
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ]
    });

    println!("Calling {} API (Model: {}) at {}...", provider, model, url);
    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .set("Authorization", &format!("Bearer {}", api_key))
        .send_json(body)
        .map_err(|e| format!("{} request failed: {:?}", provider, e))?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse {} response: {:?}", provider, e))?;

    let content = res_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or(format!("{} returned empty response", provider))?;

    Ok(content.to_string())
}

fn call_anthropic(
    model: &str,
    api_key: &str,
    system: &str,
    prompt: &str,
    base_url: &str,
) -> Result<String, String> {
    let url = format!("{}/v1/messages", base_url);
    let body = json!({
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });

    println!("Calling Anthropic API (Model: {}) at {}...", model, url);
    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .set("x-api-key", api_key)
        .set("anthropic-version", "2023-06-01")
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Anthropic request failed: {:?}", e))?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Anthropic response: {:?}", e))?;

    let content = res_json["content"][0]["text"]
        .as_str()
        .ok_or("Anthropic returned empty response")?;

    Ok(content.to_string())
}

fn call_gemini(
    model: &str,
    api_key: &str,
    system: &str,
    prompt: &str,
    base_url: &str,
) -> Result<String, String> {
    let url = format!("{}/v1beta/models/{}:generateContent", base_url, model);

    // Combine system and prompt for Gemini structures
    let full_prompt = format!(
        "System Instruction: {}\n\nUser Question: {}",
        system, prompt
    );
    let body = json!({
        "contents": [{
            "parts": [{ "text": full_prompt }]
        }]
    });

    println!("Calling Google Gemini API (Model: {})...", model);
    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .set("x-goog-api-key", api_key)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Gemini request failed: {:?}", e))?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Gemini response: {:?}", e))?;

    let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Gemini returned empty response")?;

    Ok(content.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unsupported_provider() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let res = generate_response(
            &conn,
            "Hello",
            "nonexistent-provider",
            "model-abc",
            None,
            None,
            None,
        );
        assert!(res.is_err());
        assert_eq!(
            res.unwrap_err(),
            "Unsupported LLM provider: nonexistent-provider"
        );
    }

    #[test]
    fn test_missing_api_keys() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        // OpenAI missing key
        let res_openai = generate_response(&conn, "Hello", "openai", "gpt-4o", None, None, None);
        assert!(res_openai.is_err());
        assert!(res_openai.unwrap_err().contains("API key missing"));

        // Gemini missing key
        let res_gemini = generate_response(
            &conn,
            "Hello",
            "gemini",
            "gemini-1.5-flash",
            None,
            None,
            None,
        );
        assert!(res_gemini.is_err());
        assert!(res_gemini.unwrap_err().contains("Gemini API key missing"));

        // Anthropic missing key
        let res_anthropic = generate_response(
            &conn,
            "Hello",
            "anthropic",
            "claude-3-opus",
            None,
            None,
            None,
        );
        assert!(res_anthropic.is_err());
        assert!(res_anthropic
            .unwrap_err()
            .contains("Anthropic API key missing"));
    }
}
