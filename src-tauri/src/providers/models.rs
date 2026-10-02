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
        "local" | "comfyui" | "comfy" => {
            let base = if clean_base.is_empty() {
                "http://127.0.0.1:8188"
            } else {
                clean_base
            };

            // 1. Try dedicated checkpoints endpoint: /models/checkpoints
            let checkpoints_url = format!("{}/models/checkpoints", base);
            if let Ok(response) = agent.get(&checkpoints_url).call() {
                if let Ok(res_json) = response.into_json::<serde_json::Value>() {
                    let models = extract_comfyui_checkpoints(&res_json);
                    if !models.is_empty() {
                        return Ok(models);
                    }
                }
            }

            // 2. Fall back to /object_info/CheckpointLoaderSimple or /object_info
            let simple_node_url = format!("{}/object_info/CheckpointLoaderSimple", base);
            let response = match agent.get(&simple_node_url).call() {
                Ok(resp) => resp,
                Err(_) => {
                    let full_url = format!("{}/object_info", base);
                    agent
                        .get(&full_url)
                        .call()
                        .map_err(|e| format!("Failed to connect to ComfyUI at {}: {:?}", base, e))?
                }
            };

            let res_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse ComfyUI object info: {:?}", e))?;

            Ok(extract_comfyui_checkpoints(&res_json))
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

pub(crate) fn extract_comfyui_checkpoints(json: &serde_json::Value) -> Vec<String> {
    let mut models = Vec::new();

    if let Some(list) = json.as_array() {
        for item in list {
            if let Some(name) = item.as_str() {
                models.push(name.to_string());
            }
        }
        if !models.is_empty() {
            models.sort();
            models.dedup();
            return models;
        }
    }

    let candidate_nodes = [
        json.get("CheckpointLoaderSimple"),
        json.get("CheckpointLoader"),
        Some(json),
    ];

    for node_opt in candidate_nodes.into_iter().flatten() {
        if let Some(ckpt_arr) = node_opt
            .get("input")
            .and_then(|i| i.get("required"))
            .and_then(|r| r.get("ckpt_name"))
            .and_then(|c| c.get(0))
            .and_then(|first| first.as_array())
        {
            for item in ckpt_arr {
                if let Some(name) = item.as_str() {
                    models.push(name.to_string());
                }
            }
        }
        if !models.is_empty() {
            break;
        }
    }

    models.sort();
    models.dedup();
    models
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_comfyui_checkpoints_direct_array() {
        let json = serde_json::json!([
            "sd_xl_base_1.0.safetensors",
            "v1-5-pruned-emaonly.safetensors"
        ]);
        let models = extract_comfyui_checkpoints(&json);
        assert_eq!(
            models,
            vec![
                "sd_xl_base_1.0.safetensors",
                "v1-5-pruned-emaonly.safetensors"
            ]
        );
    }

    #[test]
    fn test_extract_comfyui_checkpoints_object_info() {
        let json = serde_json::json!({
            "CheckpointLoaderSimple": {
                "input": {
                    "required": {
                        "ckpt_name": [
                            ["sd_xl_base_1.0.safetensors", "dreamshaper_8.safetensors"],
                            {"tooltip": "The name of the checkpoint (model) to load."}
                        ]
                    }
                }
            }
        });
        let models = extract_comfyui_checkpoints(&json);
        assert_eq!(
            models,
            vec!["dreamshaper_8.safetensors", "sd_xl_base_1.0.safetensors"]
        );
    }

    #[test]
    fn test_extract_comfyui_checkpoints_empty_and_garbage() {
        let json = serde_json::json!({});
        assert!(extract_comfyui_checkpoints(&json).is_empty());

        let json_garbage = serde_json::json!({"other": 123});
        assert!(extract_comfyui_checkpoints(&json_garbage).is_empty());
    }

    #[test]
    #[ignore]
    fn test_live_comfy() {
        let agent = crate::providers::http_client();
        let models = list_models("local", "http://127.0.0.1:8188", None, &agent).unwrap();
        println!("LIVE MODELS: {:?}", models);
        assert!(!models.is_empty());
    }
}
