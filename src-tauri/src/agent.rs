use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::db;
use crate::search;

#[derive(Deserialize, Serialize, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Orchestrates local RAG, fetches matching context vectors, and calls the LLM provider.
pub fn generate_response(
    db_path: &str,
    prompt: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    active_note_id: Option<&str>,
) -> Result<String, String> {
    // 1. Gather Context via Hybrid Search (RAG)
    let context_results = match search::hybrid_query(db_path, prompt, "all") {
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
        if let Ok(conn) = db::init_db(db_path) {
            if let Ok((title, content)) = conn.query_row(
                "SELECT title, content FROM notes WHERE id = ?1",
                [note_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            ) {
                active_note_context = format!("\nCurrently Open Note sheet (Title: {}):\n{}\n", title, content);
            }
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
        "ollama" => call_ollama(model, &system_prompt, prompt),
        "openai" => {
            let key = api_key.ok_or("OpenAI API key missing")?;
            call_openai(model, key, &system_prompt, prompt)
        }
        "gemini" => {
            let key = api_key.ok_or("Gemini API key missing")?;
            call_gemini(model, key, &system_prompt, prompt)
        }
        _ => Err(format!("Unsupported LLM provider: {}", provider)),
    }
}

fn call_ollama(model: &str, system: &str, prompt: &str) -> Result<String, String> {
    let url = "http://localhost:11434/api/chat";
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });

    println!("Calling Ollama API (Model: {}) at {}...", model, url);
    let response = ureq::post(url)
        .send_json(body)
        .map_err(|e| format!("Ollama request failed: {:?}. Is Ollama running locally?", e))?;

    let res_json: serde_json::Value = response.into_json()
        .map_err(|e| format!("Failed to parse Ollama JSON: {:?}", e))?;

    let content = res_json["message"]["content"]
        .as_str()
        .ok_or("Ollama returned empty response")?;

    Ok(content.to_string())
}

fn call_openai(model: &str, api_key: &str, system: &str, prompt: &str) -> Result<String, String> {
    let url = "https://api.openai.com/v1/chat/completions";
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ]
    });

    println!("Calling OpenAI API (Model: {})...", model);
    let response = ureq::post(url)
        .set("Authorization", &format!("Bearer {}", api_key))
        .send_json(body)
        .map_err(|e| format!("OpenAI request failed: {:?}", e))?;

    let res_json: serde_json::Value = response.into_json()
        .map_err(|e| format!("Failed to parse OpenAI response: {:?}", e))?;

    let content = res_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("OpenAI returned empty response")?;

    Ok(content.to_string())
}

fn call_gemini(model: &str, api_key: &str, system: &str, prompt: &str) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    
    // Combine system and prompt for Gemini structures
    let full_prompt = format!("System Instruction: {}\n\nUser Question: {}", system, prompt);
    let body = json!({
        "contents": [{
            "parts": [{ "text": full_prompt }]
        }]
    });

    println!("Calling Google Gemini API (Model: {})...", model);
    let response = ureq::post(&url)
        .send_json(body)
        .map_err(|e| format!("Gemini request failed: {:?}", e))?;

    let res_json: serde_json::Value = response.into_json()
        .map_err(|e| format!("Failed to parse Gemini response: {:?}", e))?;

    let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Gemini returned empty response")?;

    Ok(content.to_string())
}
