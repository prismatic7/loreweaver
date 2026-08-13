//! # Text-to-Speech Provider Logic
//!
//! Supports OpenAI TTS, ElevenLabs, and a placeholder for local TTS.

use base64::{engine::general_purpose, Engine as _};
use std::path::Path;
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
/// Supports OpenAI Whisper (`openai`) and a local sherpa-onnx fallback (`local`).
/// For the `local` provider, `base_url` is a filesystem path to the model directory.
/// Performs blocking HTTP/CPU work; invoke inside `spawn_blocking`.
pub fn transcribe_speech(
    audio_base64: &str,
    provider: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
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
        "local" => transcribe_local(&audio_bytes, base_url),
        other => Err(format!("Unsupported STT provider: {}", other)),
    }
}

/// Default model directory used when no `base_url` (model path) is configured.
///
/// The GM configures the model path in Settings; this is a sensible fallback so
/// the local provider works out of the box when the model is installed there.
fn default_model_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home)
        .join("Development")
        .join("loreweaver-offline-local-stt-models")
        .join("sherpa-onnx-zipformer-en-2023-06-26")
}

/// Decodes WAV or MP3 bytes into (sample_rate, interleaved f32 samples) using symphonia.
fn decode_audio(bytes: &[u8]) -> Result<(u32, Vec<f32>), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let mss = MediaSourceStream::new(Box::new(std::io::Cursor::new(bytes.to_vec())), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("wav");
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe audio: {e}"))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "Audio has no default track".to_string())?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.ok_or_else(|| "Audio has no sample rate".to_string())?;
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    let mut samples: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(symphonia::core::errors::Error::ResetRequired) => break,
            Err(e) => return Err(format!("Audio decode error: {e}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|e| format!("Audio decode error: {e}"))?;
        let mut buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        buf.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buf.samples());
    }

    if samples.is_empty() {
        return Err("Audio decoded to no samples".to_string());
    }

    // Downmix to mono if needed (sherpa-onnx expects mono).
    if channels > 1 {
        let frame_len = channels;
        let frames = samples.len() / frame_len;
        let mut mono = Vec::with_capacity(frames);
        for f in 0..frames {
            let mut sum = 0.0f32;
            for c in 0..frame_len {
                sum += samples[f * frame_len + c];
            }
            mono.push(sum / frame_len as f32);
        }
        samples = mono;
    }

    Ok((sample_rate, samples))
}

/// Runs the sherpa-onnx zipformer-en offline recognizer on the decoded audio.
fn transcribe_local(audio_bytes: &[u8], base_url: Option<&str>) -> Result<String, String> {
    use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig};

    let model_dir = match base_url.filter(|b| !b.trim().is_empty()) {
        Some(p) => Path::new(p.trim()).to_path_buf(),
        None => default_model_dir(),
    };

    let encoder = model_dir.join("encoder-epoch-99-avg-1.int8.onnx");
    let decoder = model_dir.join("decoder-epoch-99-avg-1.onnx");
    let joiner = model_dir.join("joiner-epoch-99-avg-1.int8.onnx");
    let tokens = model_dir.join("tokens.txt");

    for f in [&encoder, &decoder, &joiner, &tokens] {
        if !f.exists() {
            return Err(format!(
                "Local STT model file not found at {}. Configure the model path in Settings.",
                f.display()
            ));
        }
    }

    let (sample_rate, samples) = decode_audio(audio_bytes)?;

    let mut config = OfflineRecognizerConfig::default();
    config.model_config.transducer = OfflineTransducerModelConfig {
        encoder: Some(encoder.to_string_lossy().into_owned()),
        decoder: Some(decoder.to_string_lossy().into_owned()),
        joiner: Some(joiner.to_string_lossy().into_owned()),
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    config.model_config.num_threads = 4;

    let recognizer = OfflineRecognizer::create(&config)
        .ok_or_else(|| "Failed to load local STT model".to_string())?;
    let stream = recognizer.create_stream();
    stream.accept_waveform(sample_rate as i32, &samples);
    recognizer.decode(&stream);
    let result = stream
        .get_result()
        .ok_or_else(|| "Local STT produced no result".to_string())?;
    Ok(result.text)
}
