//! # Provider Model-List Logic
//!
//! Fetches available models from ComfyUI, Stability AI, Ollama, OpenAI-compatible,
//! Gemini, and Anthropic endpoints.

use ureq::Agent;

/// Lists available models for the given provider.
///
/// Performs blocking HTTP I/O; invoke inside `spawn_blocking`.
pub fn list_models(
    provider: &str,
    base_url: &str,
    api_key: Option<&str>,
    agent: &Agent,
) -> Result<Vec<String>, String> {
    let clean_base = base_url.trim().trim_end_matches('/');

    match provider {
        "local" => {
            let url = if clean_base.is_empty() {
                "http://127.0.0.1:8188/object_info".to_string()
            } else {
                format!("{}/object_info", clean_base)
            };

            let response = agent
                .get(&url)
                .call()
                .map_err(|e| format!("Failed to connect to ComfyUI: {:?}", e))?;

            let _: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse ComfyUI object info: {:?}", e))?;

            Ok(Vec::new())
        }
        "stability" => {
            let url = if clean_base.is_empty() {
                "https://api.stability.ai/v1/engines/list".to_string()
            } else {
                format!("{}/v1/engines/list", clean_base)
            };

            let key = api_key.ok_or("Stability API key is missing")?;
            let response = agent
                .get(&url)
                .set("Authorization", &format!("Bearer {}", key))
                .call()
                .map_err(|e| format!("Failed to connect to Stability AI: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Stability engine list: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["engines"].as_array() {
                for item in list {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }

            Ok(models)
        }
        "ollama" | "ollama-cloud" => {
            let url = if clean_base.is_empty() {
                "http://localhost:11434/api/tags".to_string()
            } else {
                format!("{}/api/tags", clean_base)
            };

            let response = agent
                .get(&url)
                .call()
                .map_err(|e| format!("Failed to connect to Ollama: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse response JSON: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["models"].as_array() {
                for item in list {
                    if let Some(name) = item["name"].as_str() {
                        models.push(name.to_string());
                    }
                }
            }
            Ok(models)
        }
        "openai" | "copilot" | "z-ai" | "kilo" | "huggingface" | "openai-compatible"
        | "openrouter" => {
            let default_url = match provider {
                "openrouter" => "https://openrouter.ai/api",
                "copilot" => "https://api.githubcopilot.com",
                "z-ai" => "https://api.z.ai/api",
                "kilo" => "https://api.kilo.ai/api",
                "huggingface" => "https://api-inference.huggingface.co",
                _ => "https://api.openai.com",
            };
            let url = if clean_base.is_empty() {
                format!("{}/v1/models", default_url)
            } else {
                format!("{}/v1/models", clean_base)
            };

            let mut request = agent.get(&url);
            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.set("Authorization", &format!("Bearer {}", key));
                }
            }

            let response = request
                .call()
                .map_err(|e| format!("Request failed: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse JSON: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(data) = res_json["data"].as_array() {
                for item in data {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        }
        "gemini" => {
            let key = api_key.ok_or("Gemini API key missing")?;
            let base = if clean_base.is_empty() {
                "https://generativelanguage.googleapis.com"
            } else {
                clean_base
            };
            let url = format!("{}/v1beta/models", base);

            let response = agent
                .get(&url)
                .set("x-goog-api-key", key)
                .call()
                .map_err(|e| format!("Failed to connect to Gemini API: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Gemini response: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(list) = res_json["models"].as_array() {
                for item in list {
                    if let Some(name) = item["name"].as_str() {
                        let clean_name = name.strip_prefix("models/").unwrap_or(name);
                        models.push(clean_name.to_string());
                    }
                }
            }
            Ok(models)
        }
        "anthropic" => {
            let key = api_key.ok_or("Anthropic API key missing")?;
            let base = if clean_base.is_empty() {
                "https://api.anthropic.com"
            } else {
                clean_base
            };
            let url = format!("{}/v1/models", base);

            let response = agent
                .get(&url)
                .set("x-api-key", key)
                .set("anthropic-version", "2023-06-01")
                .call()
                .map_err(|e| format!("Failed to connect to Anthropic API: {:?}", e))?;

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Anthropic response: {:?}", e))?;

            let mut models = Vec::new();
            if let Some(data) = res_json["data"].as_array() {
                for item in data {
                    if let Some(id) = item["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        }
        _ => Err(format!(
            "Connection test not supported for provider: {}",
            provider
        )),
    }
}
