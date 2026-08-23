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

/// User-facing sampling parameters (the "Temper").
/// Values mirror the AppSettings defaults so omitted params behave as before.
#[derive(Clone, Copy, Debug)]
pub struct SamplingParams {
    pub temperature: f64,
    pub top_p: f64,
    pub max_tokens: i64,
    pub seed: Option<i64>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self {
            temperature: 0.8,
            top_p: 1.0,
            max_tokens: 4096,
            seed: None,
        }
    }
}

/// A tool call in message history (neutral form, provider-agnostic).
#[derive(Clone, Debug)]
pub struct ToolCallMsg {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// A message in the neutral chat format used by the streaming agent loop.
///
/// `role` is one of `"system"`, `"user"`, `"assistant"`, or `"tool"`.
/// Assistant messages may carry `tool_calls`; tool messages carry the
/// `tool_call_id` they answer.
#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Vec<ToolCallMsg>,
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
        }
    }

    pub fn assistant_with_tool_calls(tool_calls: Vec<ToolCallMsg>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: String::new(),
            tool_calls,
            tool_call_id: None,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".to_string(),
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: Some(tool_call_id.into()),
        }
    }
}

/// Events emitted while streaming a response from a provider.
///
/// The agent loop translates these into `AgentEvent`s on the IPC channel.
#[derive(Clone, Debug)]
pub enum StreamEvent {
    /// A reasoning/thinking fragment.
    Reasoning(String),
    /// A text fragment of the final answer.
    Delta(String),
    /// A tool call requested by the model.
    ToolCall {
        id: String,
        name: String,
        arguments: String,
    },
    /// The turn completed; `String` is the full text.
    Done(String),
    /// A non-fatal error; the turn continues.
    Error(String),
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
    params: SamplingParams,
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
            call_ollama(model, &system_context.system_prompt, prompt, base, params, agent)
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
            call_openai_compatible(model, key, &system_context.system_prompt, prompt, base, provider, params, agent)
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
            call_gemini(model, key, &system_context.system_prompt, prompt, base, params, agent)
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
            call_anthropic(model, key, &system_context.system_prompt, prompt, base, params, agent)
        }
        other => Err(format!("Unsupported LLM provider: {}", other)),
    }
}

fn call_ollama(
    model: &str,
    system: &str,
    prompt: &str,
    base_url: &str,
    params: SamplingParams,
    agent: &Agent,
) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url);
    let mut options = serde_json::json!({
        "temperature": params.temperature,
        "top_p": params.top_p,
        "num_predict": params.max_tokens,
    });
    if let Some(seed) = params.seed {
        options["seed"] = serde_json::json!(seed);
    }
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ],
        "stream": false,
        "options": options
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
    params: SamplingParams,
    agent: &Agent,
) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", base_url);
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": prompt }
        ],
        "temperature": params.temperature,
        "top_p": params.top_p,
        "max_tokens": params.max_tokens,
    });
    if let Some(seed) = params.seed {
        body["seed"] = serde_json::json!(seed);
    }

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
    params: SamplingParams,
    agent: &Agent,
) -> Result<String, String> {
    let url = format!("{}/v1/messages", base_url);
    let body = json!({
        "model": model,
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "top_p": params.top_p,
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
    params: SamplingParams,
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
        }],
        "generationConfig": {
            "temperature": params.temperature,
            "topP": params.top_p,
            "maxOutputTokens": params.max_tokens,
        }
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

// ---------------------------------------------------------------------------
// Streaming (agent loop) support
// ---------------------------------------------------------------------------

/// Streams a response from the configured provider, emitting `StreamEvent`s
/// through `emit`. Returns the full assistant text on success.
///
/// `messages` uses the neutral `ChatMessage` format so the agent loop can
/// carry tool-call history across providers. `tools` is a list of JSON Schema
/// tool definitions (empty = no tools offered).
pub fn stream_response(
    system: &str,
    messages: &[ChatMessage],
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    allow_local: bool,
    params: SamplingParams,
    tools: &[serde_json::Value],
    agent: &Agent,
    emit: &mut dyn FnMut(StreamEvent),
) -> Result<String, String> {
    match provider {
        "ollama" => {
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("http://localhost:11434")
                .trim()
                .trim_end_matches('/');
            crate::validate_provider_url(base, allow_local)?;
            stream_ollama(model, system, messages, base, params, tools, agent, emit)
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
            stream_openai_compatible(
                model, key, system, messages, base, provider, params, tools, agent, emit,
            )
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
            stream_gemini(model, key, system, messages, base, params, tools, agent, emit)
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
            stream_anthropic(model, key, system, messages, base, params, tools, agent, emit)
        }
        other => Err(format!("Unsupported LLM provider: {}", other)),
    }
}

/// Reads one line from a ureq reader, returning `Ok(None)` at EOF.
fn read_line(reader: &mut dyn std::io::Read) -> Result<Option<String>, String> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match reader.read(&mut byte) {
            Ok(0) => {
                if buf.is_empty() {
                    return Ok(None);
                }
                return Ok(Some(String::from_utf8_lossy(&buf).to_string()));
            }
            Ok(_) => {
                if byte[0] == b'\n' {
                    return Ok(Some(String::from_utf8_lossy(&buf).to_string()));
                }
                buf.push(byte[0]);
            }
            Err(e) => return Err(format!("Failed reading stream: {}", e)),
        }
    }
}

/// Converts neutral messages to Ollama's message format.
fn ollama_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => out.push(json!({ "role": "system", "content": m.content })),
            "user" => out.push(json!({ "role": "user", "content": m.content })),
            "assistant" => {
                if m.tool_calls.is_empty() {
                    out.push(json!({ "role": "assistant", "content": m.content }));
                } else {
                    let calls: Vec<serde_json::Value> = m
                        .tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments,
                                }
                            })
                        })
                        .collect();
                    out.push(json!({ "role": "assistant", "content": m.content, "tool_calls": calls }));
                }
            }
            "tool" => out.push(json!({
                "role": "tool",
                "content": m.content,
                "tool_call_id": m.tool_call_id.as_deref().unwrap_or(""),
            })),
            _ => {}
        }
    }
    out
}

/// Streams from Ollama's `/api/chat` (NDJSON). Emits reasoning, deltas, and
/// tool calls. Returns the full assistant text.
fn stream_ollama(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    base_url: &str,
    params: SamplingParams,
    tools: &[serde_json::Value],
    agent: &Agent,
    emit: &mut dyn FnMut(StreamEvent),
) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url);
    let mut options = serde_json::json!({
        "temperature": params.temperature,
        "top_p": params.top_p,
        "num_predict": params.max_tokens,
    });
    if let Some(seed) = params.seed {
        options["seed"] = serde_json::json!(seed);
    }

    let mut msgs = ollama_messages(messages);
    if !system.trim().is_empty() {
        msgs.insert(0, json!({ "role": "system", "content": system }));
    }

    let mut body = json!({
        "model": model,
        "messages": msgs,
        "stream": true,
        "options": options,
    });
    if !tools.is_empty() {
        body["tools"] = serde_json::Value::Array(tools.to_vec());
    }

    let response = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Ollama request failed: {:?}. Is Ollama running at {}?", e, base_url))?;

    let mut reader = response.into_reader();
    let mut full_text = String::new();
    let mut pending_tool_calls: Vec<(String, String, String)> = Vec::new();

    while let Some(line) = read_line(&mut reader)? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
            break;
        }
        if let Some(msg) = v.get("message") {
            if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                if !content.is_empty() {
                    full_text.push_str(content);
                    emit(StreamEvent::Delta(content.to_string()));
                }
            }
            if let Some(calls) = msg.get("tool_calls").and_then(|c| c.as_array()) {
                for call in calls {
                    let id = call
                        .get("id")
                        .and_then(|i| i.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = call
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string();
                    let args = call
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .map(|a| a.to_string())
                        .unwrap_or_else(|| "{}".to_string());
                    if !name.is_empty() {
                        pending_tool_calls.push((id, name, args));
                    }
                }
            }
        }
    }

    for (id, name, args) in &pending_tool_calls {
        emit(StreamEvent::ToolCall { id: id.clone(), name: name.clone(), arguments: args.clone() });
    }

    if full_text.is_empty() && pending_tool_calls.is_empty() {
        return Err("Ollama returned empty response".to_string());
    }
    emit(StreamEvent::Done(full_text.clone()));
    Ok(full_text)
}

/// Converts neutral messages to OpenAI-compatible message format.
fn openai_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => out.push(json!({ "role": "system", "content": m.content })),
            "user" => out.push(json!({ "role": "user", "content": m.content })),
            "assistant" => {
                if m.tool_calls.is_empty() {
                    out.push(json!({ "role": "assistant", "content": m.content }));
                } else {
                    let calls: Vec<serde_json::Value> = m
                        .tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments,
                                }
                            })
                        })
                        .collect();
                    out.push(json!({ "role": "assistant", "content": m.content, "tool_calls": calls }));
                }
            }
            "tool" => out.push(json!({
                "role": "tool",
                "tool_call_id": m.tool_call_id.as_deref().unwrap_or(""),
                "content": m.content,
            })),
            _ => {}
        }
    }
    out
}

/// Streams from an OpenAI-compatible `/v1/chat/completions` endpoint (SSE).
/// Emits reasoning (`reasoning_content`), deltas, and tool calls.
fn stream_openai_compatible(
    model: &str,
    api_key: &str,
    system: &str,
    messages: &[ChatMessage],
    base_url: &str,
    provider: &str,
    params: SamplingParams,
    tools: &[serde_json::Value],
    agent: &Agent,
    emit: &mut dyn FnMut(StreamEvent),
) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", base_url);
    let mut msgs = openai_messages(messages);
    if !system.trim().is_empty() {
        msgs.insert(0, json!({ "role": "system", "content": system }));
    }

    let mut body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "stream": true,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "max_tokens": params.max_tokens,
    });
    if let Some(seed) = params.seed {
        body["seed"] = serde_json::json!(seed);
    }
    if !tools.is_empty() {
        body["tools"] = serde_json::Value::Array(tools.to_vec());
    }

    let response = agent
        .post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("Authorization", &format!("Bearer {}", api_key))
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("{} request failed: {:?}", provider, e))?;

    let mut reader = response.into_reader();
    let mut full_text = String::new();
    // Accumulate tool-call fragments keyed by index.
    let mut tool_fragments: std::collections::HashMap<usize, (String, String, String)> =
        std::collections::HashMap::new();

    while let Some(line) = read_line(&mut reader)? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data == "[DONE]" {
                break;
            }
            let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            let Some(choice) = v.get("choices").and_then(|c| c.as_array()).and_then(|c| c.first()) else {
                continue;
            };
            let Some(delta) = choice.get("delta") else {
                continue;
            };
            if let Some(rc) = delta.get("reasoning_content").and_then(|r| r.as_str()) {
                if !rc.is_empty() {
                    emit(StreamEvent::Reasoning(rc.to_string()));
                }
            }
            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                if !content.is_empty() {
                    full_text.push_str(content);
                    emit(StreamEvent::Delta(content.to_string()));
                }
            }
            if let Some(calls) = delta.get("tool_calls").and_then(|c| c.as_array()) {
                for call in calls {
                    let idx = call.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                    let entry = tool_fragments.entry(idx).or_insert_with(|| (String::new(), String::new(), String::new()));
                    if let Some(id) = call.get("id").and_then(|i| i.as_str()) {
                        entry.0 = id.to_string();
                    }
                    if let Some(fname) = call.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()) {
                        entry.1 = fname.to_string();
                    }
                    if let Some(fargs) = call.get("function").and_then(|f| f.get("arguments")).and_then(|a| a.as_str()) {
                        entry.2.push_str(fargs);
                    }
                }
            }
        }
    }

    let mut indices: Vec<usize> = tool_fragments.keys().cloned().collect();
    indices.sort_unstable();
    for idx in indices {
        let (id, name, args) = tool_fragments.remove(&idx).unwrap();
        if !name.is_empty() {
            emit(StreamEvent::ToolCall { id, name, arguments: args });
        }
    }

    if full_text.is_empty() && tool_fragments.is_empty() {
        return Err(format!("{} returned empty response", provider));
    }
    emit(StreamEvent::Done(full_text.clone()));
    Ok(full_text)
}

/// Converts neutral messages to Anthropic's message format.
fn anthropic_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => {} // handled separately
            "user" => out.push(json!({ "role": "user", "content": m.content })),
            "assistant" => {
                if m.tool_calls.is_empty() {
                    out.push(json!({ "role": "assistant", "content": m.content }));
                } else {
                    let mut content: Vec<serde_json::Value> = Vec::new();
                    if !m.content.is_empty() {
                        content.push(json!({ "type": "text", "text": m.content }));
                    }
                    for tc in &m.tool_calls {
                        let args: serde_json::Value =
                            serde_json::from_str(&tc.arguments).unwrap_or(serde_json::Value::Object(Default::default()));
                        content.push(json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": args,
                        }));
                    }
                    out.push(json!({ "role": "assistant", "content": content }));
                }
            }
            "tool" => out.push(json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id.as_deref().unwrap_or(""),
                    "content": m.content,
                }]
            })),
            _ => {}
        }
    }
    out
}

/// Streams from Anthropic's `/v1/messages` endpoint (SSE). Emits reasoning
/// (`thinking` blocks), deltas, and tool calls.
fn stream_anthropic(
    model: &str,
    api_key: &str,
    system: &str,
    messages: &[ChatMessage],
    base_url: &str,
    params: SamplingParams,
    tools: &[serde_json::Value],
    agent: &Agent,
    emit: &mut dyn FnMut(StreamEvent),
) -> Result<String, String> {
    let url = format!("{}/v1/messages", base_url);
    let mut body = json!({
        "model": model,
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "stream": true,
        "messages": anthropic_messages(messages),
    });
    if !system.trim().is_empty() {
        body["system"] = json!(system);
    }
    if !tools.is_empty() {
        body["tools"] = serde_json::Value::Array(tools.to_vec());
    }

    let response = agent
        .post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("x-api-key", api_key)
        .set("anthropic-version", "2023-06-01")
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Anthropic request failed: {:?}", e))?;

    let mut reader = response.into_reader();
    let mut full_text = String::new();
    // Tool-use blocks accumulate input_json_delta fragments.
    let mut tool_blocks: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();
    let mut current_block_type = String::new();
    let mut current_block_id = String::new();
    let mut current_block_name = String::new();

    while let Some(line) = read_line(&mut reader)? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data == "[DONE]" {
                break;
            }
            let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            let event = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match event {
                "content_block_start" => {
                    let block = v.get("content_block").cloned().unwrap_or_default();
                    current_block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    current_block_id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                    current_block_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                    if current_block_type == "tool_use" {
                        tool_blocks.insert(
                            current_block_id.clone(),
                            (current_block_id.clone(), current_block_name.clone(), String::new()),
                        );
                    }
                }
                "content_block_delta" => {
                    let delta = v.get("delta").cloned().unwrap_or_default();
                    let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    match delta_type {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                full_text.push_str(text);
                                emit(StreamEvent::Delta(text.to_string()));
                            }
                        }
                        "thinking_delta" => {
                            if let Some(text) = delta.get("thinking").and_then(|t| t.as_str()) {
                                emit(StreamEvent::Reasoning(text.to_string()));
                            }
                        }
                        "input_json_delta" => {
                            if let Some(partial) = delta.get("partial_json").and_then(|p| p.as_str()) {
                                if let Some(entry) = tool_blocks.get_mut(&current_block_id) {
                                    entry.2.push_str(partial);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                "content_block_stop" => {
                    current_block_type.clear();
                    current_block_id.clear();
                    current_block_name.clear();
                }
                _ => {}
            }
        }
    }

    for (id, (_, name, args)) in &tool_blocks {
        if !name.is_empty() {
            emit(StreamEvent::ToolCall { id: id.clone(), name: name.clone(), arguments: args.clone() });
        }
    }

    if full_text.is_empty() && tool_blocks.is_empty() {
        return Err("Anthropic returned empty response".to_string());
    }
    emit(StreamEvent::Done(full_text.clone()));
    Ok(full_text)
}

/// Converts neutral messages to Gemini's contents format.
fn gemini_contents(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => {} // handled separately
            "user" => out.push(json!({ "role": "user", "parts": [{ "text": m.content }] })),
            "assistant" => {
                if m.tool_calls.is_empty() {
                    out.push(json!({ "role": "model", "parts": [{ "text": m.content }] }));
                } else {
                    let mut parts: Vec<serde_json::Value> = Vec::new();
                    if !m.content.is_empty() {
                        parts.push(json!({ "text": m.content }));
                    }
                    for tc in &m.tool_calls {
                        let args: serde_json::Value =
                            serde_json::from_str(&tc.arguments).unwrap_or(serde_json::Value::Object(Default::default()));
                        parts.push(json!({ "functionCall": { "name": tc.name, "args": args } }));
                    }
                    out.push(json!({ "role": "model", "parts": parts }));
                }
            }
            "tool" => {
                let args: serde_json::Value =
                    serde_json::from_str(&m.content).unwrap_or(serde_json::Value::Object(Default::default()));
                out.push(json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": m.tool_call_id.as_deref().unwrap_or(""),
                            "response": { "result": args },
                        }
                    }]
                }));
            }
            _ => {}
        }
    }
    out
}

/// Streams from Gemini's `streamGenerateContent` endpoint (SSE). Emits
/// reasoning (`thought` parts), deltas, and tool calls.
fn stream_gemini(
    model: &str,
    api_key: &str,
    system: &str,
    messages: &[ChatMessage],
    base_url: &str,
    params: SamplingParams,
    tools: &[serde_json::Value],
    agent: &Agent,
    emit: &mut dyn FnMut(StreamEvent),
) -> Result<String, String> {
    let url = format!(
        "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
        base_url, model
    );

    let mut contents = gemini_contents(messages);
    if !system.trim().is_empty() {
        contents.insert(0, json!({ "role": "user", "parts": [{ "text": system }] }));
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": {
            "temperature": params.temperature,
            "topP": params.top_p,
            "maxOutputTokens": params.max_tokens,
        }
    });
    if !tools.is_empty() {
        let declarations: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.get("name").cloned().unwrap_or_default(),
                    "description": t.get("description").cloned().unwrap_or_default(),
                    "parameters": t.get("parameters").cloned().unwrap_or_default(),
                })
            })
            .collect();
        body["tools"] = json!([{ "functionDeclarations": declarations }]);
    }

    let response = agent
        .post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("x-goog-api-key", api_key)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Gemini request failed: {:?}", e))?;

    let mut reader = response.into_reader();
    let mut full_text = String::new();
    let mut pending_tool_calls: Vec<(String, String, String)> = Vec::new();

    while let Some(line) = read_line(&mut reader)? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            let Some(candidate) = v.get("candidates").and_then(|c| c.as_array()).and_then(|c| c.first()) else {
                continue;
            };
            let Some(content) = candidate.get("content") else {
                continue;
            };
            let Some(parts) = content.get("parts").and_then(|p| p.as_array()) else {
                continue;
            };
            for part in parts {
                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                    if !text.is_empty() {
                        full_text.push_str(text);
                        emit(StreamEvent::Delta(text.to_string()));
                    }
                }
                if let Some(thought) = part.get("thought").and_then(|t| t.as_bool()) {
                    if thought {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            emit(StreamEvent::Reasoning(text.to_string()));
                        }
                    }
                }
                if let Some(fc) = part.get("functionCall") {
                    let name = fc.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                    let args = fc.get("args").map(|a| a.to_string()).unwrap_or_else(|| "{}".to_string());
                    if !name.is_empty() {
                        pending_tool_calls.push((format!("gemini-{}", pending_tool_calls.len()), name, args));
                    }
                }
            }
        }
    }

    for (id, name, args) in &pending_tool_calls {
        emit(StreamEvent::ToolCall { id: id.clone(), name: name.clone(), arguments: args.clone() });
    }

    if full_text.is_empty() && pending_tool_calls.is_empty() {
        return Err("Gemini returned empty response".to_string());
    }
    emit(StreamEvent::Done(full_text.clone()));
    Ok(full_text)
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
            SamplingParams::default(),
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
        let params = SamplingParams::default();

        // OpenAI missing key
        let res_openai = generate_response(
            &system_context,
            "Hello",
            "openai",
            "gpt-4o",
            None,
            None,
            false,
            params,
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
            params,
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
            params,
            &agent,
        );
        assert!(res_anthropic.is_err());
        assert!(res_anthropic
            .unwrap_err()
            .contains("Anthropic API key missing"));
    }
}
