//! # Image Generation Provider Logic
//!
//! Supports ComfyUI (local), OpenAI / OpenAI-compatible image endpoints, and Stability AI.

use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use ureq::Agent;

fn image_data_url_from_bytes(bytes: &[u8]) -> String {
    let encoded = general_purpose::STANDARD.encode(bytes);
    format!("data:image/png;base64,{}", encoded)
}

fn image_bytes_from_response(response: serde_json::Value) -> Result<Vec<u8>, String> {
    if let Some(b64_json) = response["data"][0]["b64_json"].as_str() {
        return base64::engine::general_purpose::STANDARD
            .decode(b64_json)
            .map_err(|e| format!("Failed to decode image payload: {}", e));
    }

    if let Some(url) = response["data"][0]["url"].as_str() {
        let image_response = ureq::get(url)
            .call()
            .map_err(|e| format!("Failed to download generated image: {:?}", e))?;
        let mut reader = image_response.into_reader();
        let mut bytes = Vec::new();
        std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;
        return Ok(bytes);
    }

    if let Some(images) = response["images"].as_array() {
        if let Some(image) = images.first().and_then(|value| value.as_str()) {
            return base64::engine::general_purpose::STANDARD
                .decode(image)
                .map_err(|e| format!("Failed to decode Stable Diffusion image payload: {}", e));
        }
    }

    if let Some(artifacts) = response["artifacts"].as_array() {
        if let Some(image) = artifacts
            .first()
            .and_then(|value| value["base64"].as_str().or(value["base64_data"].as_str()))
        {
            return base64::engine::general_purpose::STANDARD
                .decode(image)
                .map_err(|e| format!("Failed to decode Stability image payload: {}", e));
        }
    }

    Err("Image service returned no usable image payload".to_string())
}

/// Generates an image for the given provider and returns a base64 data URL.
///
/// Performs blocking HTTP I/O; invoke inside `spawn_blocking`.
pub fn generate_image(
    prompt: &str,
    style: &str,
    provider: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{} Style: {}.", prompt.trim(), style.trim())
    };

    let image_model = if model.trim().is_empty() {
        "dall-e-3"
    } else {
        model.trim()
    };

    match provider {
        "local" => generate_comfyui_image(prompt, style, image_model, base_url, agent),
        "openai" | "openai-compatible" => {
            let base = base_url
                .unwrap_or("https://api.openai.com")
                .trim()
                .trim_end_matches('/');
            crate::validate_provider_url(base, false)?;
            if base.is_empty() {
                return Err("Image provider base URL is required".to_string());
            }

            let url = format!("{}/v1/images/generations", base);
            let body = json!({
                "model": image_model,
                "prompt": clean_prompt,
                "size": "1024x1024",
                "response_format": "b64_json"
            });

            let mut request = agent
                .post(&url)
                .set("Content-Type", "application/json");
            if let Some(key) = api_key {
                if !key.trim().is_empty() {
                    request = request.set("Authorization", &format!("Bearer {}", key.trim()));
                }
            }

            let response = request
                .send_json(body)
                .map_err(|e| format!("Image generation request failed: {:?}", e))?;

            let response_json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse image generation response: {:?}", e))?;
            let image_bytes = image_bytes_from_response(response_json)?;
            Ok(image_data_url_from_bytes(&image_bytes))
        }
        "stability" => generate_stability_image(prompt, style, image_model, api_key, base_url, agent),
        other => Err(format!("Unsupported image provider: {}", other)),
    }
}

fn generate_comfyui_image(
    prompt: &str,
    style: &str,
    model: &str,
    base_url: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    let base = base_url
        .unwrap_or("http://127.0.0.1:8188")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("ComfyUI base URL is required".to_string());
    }

    let client_id = uuid::Uuid::new_v4().to_string();
    let positive_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let negative_prompt = "blurry, low quality, distorted, watermark, text, extra limbs";
    let checkpoint = if model.trim().is_empty() {
        "stable-diffusion-v1-5.safetensors"
    } else {
        model.trim()
    };

    let workflow = serde_json::json!({
        "3": {
            "inputs": {
                "seed": uuid::Uuid::new_v4().as_u128() as u64,
                "steps": 28,
                "cfg": 7,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1,
                "model": [4, 0],
                "positive": [6, 0],
                "negative": [7, 0],
                "latent_image": [5, 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "4": {
            "inputs": {
                "ckpt_name": checkpoint
            },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "CheckpointLoaderSimple" }
        },
        "5": {
            "inputs": {
                "width": 768,
                "height": 768,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage",
            "_meta": { "title": "EmptyLatentImage" }
        },
        "6": {
            "inputs": {
                "text": positive_prompt,
                "clip": [4, 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIPTextEncode" }
        },
        "7": {
            "inputs": {
                "text": negative_prompt,
                "clip": [4, 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIPTextEncode" }
        },
        "8": {
            "inputs": {
                "samples": [3, 0],
                "vae": [4, 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAEDecode" }
        },
        "9": {
            "inputs": {
                "images": [8, 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "SaveImage" }
        }
    });

    let prompt_body = serde_json::json!({
        "prompt": workflow,
        "client_id": client_id
    });

    let prompt_response = agent
        .post(&format!("{}/prompt", base))
        .set("Content-Type", "application/json")
        .send_json(prompt_body)
        .map_err(|e| format!("ComfyUI prompt submission failed: {:?}", e))?;

    let prompt_json: serde_json::Value = prompt_response
        .into_json()
        .map_err(|e| format!("Failed to parse ComfyUI prompt response: {:?}", e))?;
    let prompt_id = prompt_json["prompt_id"]
        .as_str()
        .ok_or("ComfyUI did not return a prompt_id")?;

    let history_url = format!("{}/history/{}", base, prompt_id);
    let mut history_json: Option<serde_json::Value> = None;

    for _ in 0..60 {
        let response = agent
            .get(&history_url)
            .call()
            .map_err(|e| format!("ComfyUI history request failed: {:?}", e))?;
        let parsed: serde_json::Value = response
            .into_json()
            .map_err(|e| format!("Failed to parse ComfyUI history response: {:?}", e))?;

        if parsed.get(prompt_id).is_some() {
            history_json = Some(parsed);
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    let history_json = history_json.ok_or("Timed out waiting for ComfyUI image generation")?;
    let images = history_json[prompt_id]["outputs"]["9"]["images"]
        .as_array()
        .ok_or("ComfyUI history response did not include output images")?;
    let image_info = images
        .first()
        .ok_or("ComfyUI returned no generated images")?;

    let filename = image_info["filename"]
        .as_str()
        .ok_or("ComfyUI image filename missing")?;
    let subfolder = image_info["subfolder"].as_str().unwrap_or("");
    let image_type = image_info["type"].as_str().unwrap_or("output");

    let image_url = format!(
        "{}/view?filename={}&subfolder={}&type={}",
        base,
        urlencoding::encode(filename),
        urlencoding::encode(subfolder),
        urlencoding::encode(image_type)
    );

    let image_response = agent
        .get(&image_url)
        .call()
        .map_err(|e| format!("Failed to download ComfyUI image: {:?}", e))?;
    let mut reader = image_response.into_reader();
    let mut bytes = Vec::new();
    std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;
    Ok(image_data_url_from_bytes(&bytes))
}

#[allow(dead_code)]
fn generate_local_stable_diffusion(
    prompt: &str,
    style: &str,
    model: &str,
    base_url: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    let base = base_url
        .unwrap_or("http://127.0.0.1:7860")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("Local Stable Diffusion base URL is required".to_string());
    }

    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let mut body = serde_json::json!({
        "prompt": clean_prompt,
        "negative_prompt": "blurry, low quality, distorted, watermark, text, extra limbs",
        "steps": 28,
        "cfg_scale": 7,
        "width": 768,
        "height": 768,
        "sampler_name": "DPM++ 2M Karras",
        "batch_size": 1,
        "n_iter": 1,
        "send_images": true,
        "save_images": false,
        "override_settings_restore_afterwards": true
    });

    if !model.trim().is_empty() {
        body["override_settings"] = serde_json::json!({
            "sd_model_checkpoint": model.trim()
        });
    }

    let url = format!("{}/sdapi/v1/txt2img", base);
    let response = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Local Stable Diffusion request failed: {:?}", e))?;

    let response_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Stable Diffusion response: {:?}", e))?;
    let image_bytes = image_bytes_from_response(response_json)?;
    Ok(image_data_url_from_bytes(&image_bytes))
}

fn generate_stability_image(
    prompt: &str,
    style: &str,
    model: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    let key = api_key
        .filter(|value| !value.trim().is_empty())
        .ok_or("Stability API key is required")?;

    let base = base_url
        .unwrap_or("https://api.stability.ai")
        .trim()
        .trim_end_matches('/');

    if base.is_empty() {
        return Err("Stability API base URL is required".to_string());
    }

    let clean_prompt = if style.trim().is_empty() {
        prompt.trim().to_string()
    } else {
        format!("{}, style: {}", prompt.trim(), style.trim())
    };

    let engine_id = if model.trim().is_empty() {
        "stable-diffusion-xl-1024-v1-0"
    } else {
        model.trim()
    };

    let url = format!("{}/v1/generation/{}/text-to-image", base, engine_id);
    let body = serde_json::json!({
        "text_prompts": [{ "text": clean_prompt }],
        "cfg_scale": 7,
        "clip_guidance_preset": "FAST_BLUE",
        "height": 768,
        "width": 768,
        "samples": 1,
        "steps": 30
    });

    let response = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {}", key.trim()))
        .send_json(body)
        .map_err(|e| format!("Stability image generation request failed: {:?}", e))?;

    let response_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Stability response: {:?}", e))?;
    let image_bytes = image_bytes_from_response(response_json)?;
    Ok(image_data_url_from_bytes(&image_bytes))
}
