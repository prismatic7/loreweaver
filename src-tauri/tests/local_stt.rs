//! Integration test for the local (sherpa-onnx) STT provider.
//!
//! Skips gracefully when the model directory is not present so `cargo test`
//! passes on machines without the downloaded model. When the model exists, it
//! generates a short WAV and asserts `transcribe_speech` returns `Ok(_)`.

use base64::{engine::general_purpose, Engine as _};
use std::path::Path;

/// Default model directory (mirrors `default_model_dir` in speech.rs).
fn model_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home)
        .join("Development")
        .join("loreweaver-offline-local-stt-models")
        .join("sherpa-onnx-zipformer-en-2023-06-26")
}

/// Generates a short mono 16-bit PCM WAV (1 second of a 440 Hz sine wave).
fn make_wav() -> Vec<u8> {
    use hound::{SampleFormat, WavSpec, WavWriter};
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let mut buf = Vec::new();
    {
        let mut writer = WavWriter::new(std::io::Cursor::new(&mut buf), spec).unwrap();
        let sample_rate = spec.sample_rate as f32;
        for i in 0..sample_rate as usize {
            let t = i as f32 / sample_rate;
            let sample = (2.0 * std::f32::consts::PI * 440.0 * t).sin();
            writer.write_sample((sample * i16::MAX as f32) as i16).unwrap();
        }
        writer.finalize().unwrap();
    }
    buf
}

#[test]
fn local_stt_transcribes_wav() {
    let dir = model_dir();
    let encoder = dir.join("encoder-epoch-99-avg-1.int8.onnx");
    if !encoder.exists() {
        eprintln!(
            "SKIP: local STT model not found at {}. Skipping integration test.",
            dir.display()
        );
        return;
    }

    let wav = make_wav();
    let audio_base64 = general_purpose::STANDARD.encode(&wav);
    let agent = tauri_app_lib::providers::http_client();

    let result = tauri_app_lib::providers::speech::transcribe_speech(
        &audio_base64,
        "local",
        None,
        Some(dir.to_str().unwrap()),
        &agent,
    );

    match result {
        Ok(text) => {
            eprintln!("Local STT produced transcription: {:?}", text);
            // A pure sine wave is not speech, so the model may return empty
            // text — the acceptance criterion is that it returns Ok(_) without
            // panicking.
        }
        Err(e) => panic!("local STT failed: {e}"),
    }
}

#[test]
fn local_stt_returns_clean_error_when_model_missing() {
    let missing = Path::new("/nonexistent/loreweaver-stt-model");
    let wav = make_wav();
    let audio_base64 = general_purpose::STANDARD.encode(&wav);
    let agent = tauri_app_lib::providers::http_client();

    let result = tauri_app_lib::providers::speech::transcribe_speech(
        &audio_base64,
        "local",
        None,
        Some(missing.to_str().unwrap()),
        &agent,
    );

    let err = result.expect_err("expected an error for a missing model");
    assert!(
        err.contains("Local STT model file not found"),
        "unexpected error message: {err}"
    );
}
