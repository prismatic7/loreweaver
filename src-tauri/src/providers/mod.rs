//! # AI Provider Modules
//!
//! Centralizes all HTTP I/O for AI/ML providers (LLM chat, image generation,
//! text-to-speech, and model-list fetching). Each submodule owns its payload
//! construction, provider-specific URL handling, and response parsing.
//!
//! The top-level `http_client` helper exposes a shared `ureq`-based agent
//! preconfigured with the standard request timeout used across providers.

pub mod image;
pub mod llm;
pub mod models;
pub mod speech;

use std::time::Duration;
use ureq::Agent;

/// Returns a shared `ureq` HTTP agent with the default provider request timeout.
pub fn http_client() -> Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(60))
        .build()
}
