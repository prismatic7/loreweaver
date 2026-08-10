//! # Text-to-Speech Provider Logic
//!
//! Supports OpenAI TTS, ElevenLabs, and a placeholder for local TTS.

use base64::{engine::general_purpose, Engine as _};
use ureq::Agent;

/// Generates speech audio from text using the configured TTS provider.
/// Returns a base64-encoded audio data URL suitable for <audio> playback.
///
/// Performs blocking HTTP I/O; invoke inside `spawn_blocking`.
pub fn generate_speech(
    text: &str,
    provider: &str,
    api_key: Option<&str>,
    voice: Option<&str>,
    base_url: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is required for speech generation".to_string());
    }

    match provider {
        "openai" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("OpenAI TTS API key is required")?;
            let base = base_url
                .filter(|b| !b.trim().is_empty())
                .unwrap_or("https://api.openai.com")
                .trim()
                .trim_end_matches('/');
            let voice_name = voice.filter(|v| !v.trim().is_empty()).unwrap_or("alloy");

            let url = format!("{}/v1/audio/speech", base);
            let body = serde_json::json!({
                "model": "tts-1",
                "voice": voice_name,
                "input": text,
                "response_format": "mp3",
            });

            let response = agent
                .post(&url)
                .timeout(std::time::Duration::from_secs(30))
                .set("Authorization", &format!("Bearer {}", key.trim()))
                .set("Content-Type", "application/json")
                .send_json(body)
                .map_err(|e| format!("OpenAI TTS request failed: {:?}", e))?;

            let mut reader = response.into_reader();
            let mut bytes = Vec::new();
            std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;

            let encoded = general_purpose::STANDARD.encode(&bytes);
            Ok(format!("data:audio/mp3;base64,{}", encoded))
        }
        "elevenlabs" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("ElevenLabs API key is required")?;
            let voice_id = voice
                .filter(|v| !v.trim().is_empty())
                .unwrap_or("21m00Tcm4TlvDq8ikWAM");

            let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);
            let body = serde_json::json!({
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 },
            });

            let response = agent
                .post(&url)
                .timeout(std::time::Duration::from_secs(30))
                .set("xi-api-key", key.trim())
                .set("Content-Type", "application/json")
                .send_json(body)
                .map_err(|e| format!("ElevenLabs TTS request failed: {:?}", e))?;

            let mut reader = response.into_reader();
            let mut bytes = Vec::new();
            std::io::copy(&mut reader, &mut bytes).map_err(|e| e.to_string())?;

            let encoded = general_purpose::STANDARD.encode(&bytes);
            Ok(format!("data:audio/mp3;base64,{}", encoded))
        }
        "local" => Err("Local TTS is not yet implemented. Configure an API-based provider (OpenAI or ElevenLabs) in Settings.".to_string()),
        other => Err(format!("Unsupported TTS provider: {}", other)),
    }
}
