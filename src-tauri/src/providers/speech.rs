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
        "local" => {
            // Best-effort local TTS via espeak-ng if available on the system.
            // No heavy Rust dependency; shells out to the espeak-ng binary.
            let text_arg = text.to_string();
            let voice_arg = voice.unwrap_or("en").to_string();
            let result = std::process::Command::new("espeak-ng")
                .args(["-v", &voice_arg, "-w", "-", &text_arg])
                .output();
            match result {
                Ok(out) if out.status.success() && !out.stdout.is_empty() => {
                    let encoded = general_purpose::STANDARD.encode(&out.stdout);
                    Ok(format!("data:audio/wav;base64,{}", encoded))
                }
                Ok(_) => Err(
                    "Local TTS (espeak-ng) produced no audio. Install espeak-ng or configure an API-based provider."
                        .to_string(),
                ),
                Err(e) => Err(format!(
                    "Local TTS (espeak-ng) unavailable: {}. Install espeak-ng or configure an API-based provider.",
                    e
                )),
            }
        }
        other => Err(format!("Unsupported TTS provider: {}", other)),
    }
}

/// Transcribes audio bytes (base64) to text using the configured STT provider.
///
/// Supports OpenAI Whisper (`openai`) and a local fallback placeholder.
/// Performs blocking HTTP I/O; invoke inside `spawn_blocking`.
pub fn transcribe_speech(
    audio_base64: &str,
    provider: &str,
    api_key: Option<&str>,
    agent: &Agent,
) -> Result<String, String> {
    if audio_base64.trim().is_empty() {
        return Err("Audio is required for transcription".to_string());
    }

    let audio_bytes = general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| format!("Failed to decode audio bytes: {e}"))?;

    match provider {
        "openai" => {
            let key = api_key
                .filter(|k| !k.trim().is_empty())
                .ok_or("OpenAI Whisper API key is required")?;
            let url = "https://api.openai.com/v1/audio/transcriptions";
            let boundary = format!("----loreweaver{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0));

            let mut body = Vec::new();
            body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
            body.extend_from_slice(
                b"Content-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-1\r\n",
            );
            body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
            body.extend_from_slice(
                b"Content-Disposition: form-data; name=\"file\"; filename=\"audio.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n",
            );
            body.extend_from_slice(&audio_bytes);
            body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

            let response = agent
                .post(url)
                .timeout(std::time::Duration::from_secs(60))
                .set("Authorization", &format!("Bearer {}", key.trim()))
                .set("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
                .send_bytes(&body)
                .map_err(|e| format!("OpenAI Whisper request failed: {:?}", e))?;

            let json: serde_json::Value = response
                .into_json()
                .map_err(|e| format!("Failed to parse Whisper response: {e}"))?;
            json["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "Whisper returned no transcription text".to_string())
        }
        "local" => Err(
            "Local STT is not yet implemented. Configure OpenAI Whisper in Settings.".to_string(),
        ),
        other => Err(format!("Unsupported STT provider: {}", other)),
    }
}
