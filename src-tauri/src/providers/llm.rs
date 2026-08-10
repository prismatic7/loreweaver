//! # LLM Provider Chat Logic
//!
//! Dispatches chat payloads to Ollama, OpenAI-compatible providers, Gemini, and Anthropic.

use serde_json::json;
use ureq::Agent;

/// Pre-computed RAG + active-note context used by the LLM orchestrator.
///
/// Holding this structure lets us release the SQLite connection lock before
/// performing any blocking network I/O.
pub struct SystemContext {
    pub system_prompt: String,
    pub active_note_context: String,
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
    agent: &Agent,
) -> Result<String, String> {
    match provider {
        "ollama" => {
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("http://localhost:11434")
                .trim()
                .trim_end_matches('/');
            crate::validate_provider_url(base, allow_local)?;
            call_ollama(model, &system_context.system_prompt, prompt, base, agent)
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
            crate::validate_provider_url(base, allow_local)?;
            call_openai_compatible(model, key, &system_context.system_prompt, prompt, base, provider, agent)
        }
        "gemini" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("Gemini API key missing")?;
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("https://generativelanguage.googleapis.com")
                .trim()
                .trim_end_matches('/');
            crate::validate_provider_url(base, allow_local)?;
            call_gemini(model, key, &system_context.system_prompt, prompt, base, agent)
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
            crate::validate_provider_url(base, allow_local)?;
            call_anthropic(model, key, &system_context.system_prompt, prompt, base, agent)
        }
        other => Err(format!("Unsupported LLM provider: {}", other)),
    }
}

fn call_ollama(model: &str, system: &str, prompt: &str, base_url: &str, agent: &Agent) -> Result<String, String> {
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
    let response = agent
        .post(&url)
        .set("Content-Type", "application/json")
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
    agent: &Agent,
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
    let response = agent
        .post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .set("Authorization", &format!("Bearer {}", api_key))
        .set("Content-Type", "application/json")
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
    agent: &Agent,
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
    let response = agent
        .post(&url)
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
    agent: &Agent,
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
    let response = agent
        .post(&url)
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
        let system_context = SystemContext {
            system_prompt: "test".to_string(),
            active_note_context: String::new(),
        };
        let agent = crate::providers::http_client();
        let res = generate_response(
            &system_context,
            "Hello",
            "nonexistent-provider",
            "model-abc",
            None,
            None,
            false,
            &agent,
        );
        assert!(res.is_err());
        assert_eq!(
            res.unwrap_err(),
            "Unsupported LLM provider: nonexistent-provider"
        );
    }

    #[test]
    fn test_missing_api_keys() {
        let system_context = SystemContext {
            system_prompt: "test".to_string(),
            active_note_context: String::new(),
        };
        let agent = crate::providers::http_client();

        // OpenAI missing key
        let res_openai = generate_response(
            &system_context,
            "Hello",
            "openai",
            "gpt-4o",
            None,
            None,
            false,
            &agent,
        );
        assert!(res_openai.is_err());
        assert!(res_openai.unwrap_err().contains("API key missing"));

        // Gemini missing key
        let res_gemini = generate_response(
            &system_context,
            "Hello",
            "gemini",
            "gemini-1.5-flash",
            None,
            None,
            false,
            &agent,
        );
        assert!(res_gemini.is_err());
        assert!(res_gemini.unwrap_err().contains("Gemini API key missing"));

        // Anthropic missing key
        let res_anthropic = generate_response(
            &system_context,
            "Hello",
            "anthropic",
            "claude-3-opus",
            None,
            None,
            false,
            &agent,
        );
        assert!(res_anthropic.is_err());
        assert!(res_anthropic
            .unwrap_err()
            .contains("Anthropic API key missing"));
    }
}
