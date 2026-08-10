// Shared type definitions exported for the React frontend via Tauri Specta.
// This module is included both by `lib.rs` (at runtime) and by `build.rs` (at compile time)
// so TypeScript bindings are generated without duplicating the source of truth.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct CampaignNote {
    pub id: String,
    pub title: String,
    pub path: String,
    #[specta(type = HashMap<String, specta_typescript::Unknown>)]
    pub frontmatter: HashMap<String, serde_json::Value>,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct RuleEntry {
    pub id: String,
    pub path: String,
    pub title: String,
    pub category: String,
    pub source: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct SearchResult {
    pub r#type: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct AppSettings {
    pub llm_provider: String,
    pub llm_model: String,
    pub llm_api_key: String,
    pub llm_base_url: String,

    pub embed_provider: String,
    pub embed_model: String,
    pub embed_api_key: String,
    pub embed_base_url: String,

    pub image_provider: String,
    pub image_model: String,
    pub image_api_key: String,
    pub image_base_url: String,

    pub tts_provider: String,
    pub tts_api_key: String,
    pub tts_voice: String,

    pub stt_provider: String,
    pub stt_api_key: String,

    pub allow_local_providers: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct TemplateProperty {
    pub r#type: String,
    #[specta(type = specta_typescript::Unknown)]
    pub default: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct TemplateAction {
    pub label: String,
    pub hook: String,
    pub plugin: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct TemplateEntry {
    pub name: String,
    pub properties: HashMap<String, TemplateProperty>,
    pub actions: Vec<TemplateAction>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct VaultSettings {
    pub name: Option<String>,
    pub campaign_system: Option<String>,
    pub description: Option<String>,
    pub tag_colors: Option<HashMap<String, String>>,
}

/// PluginInfo mirrors the runtime type in `plugins.rs` so it can be exported to TypeScript.
/// It is kept minimal because Specta only needs the public shape.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub script_content: String,
    pub active: bool,
}

/// Export TypeScript bindings for all command input/output types.
pub fn export_bindings_to(path: impl AsRef<std::path::Path>) {
    tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<CampaignNote>()
        .typ::<RuleEntry>()
        .typ::<SearchResult>()
        .typ::<AppSettings>()
        .typ::<VaultSettings>()
        .typ::<TemplateEntry>()
        .typ::<TemplateProperty>()
        .typ::<TemplateAction>()
        .typ::<PluginInfo>()
        .dangerously_cast_bigints_to_number()
        .export(specta_typescript::Typescript::default(), path)
        .expect("Failed to export bindings");
}
