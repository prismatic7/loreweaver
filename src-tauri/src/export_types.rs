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
pub struct SourceEntry {
    pub id: String,
    pub title: String,
    pub author: String,
    pub source_type: String,
    pub url: String,
    pub date: String,
}

/// Result of a web clipping operation: the fetched page's readable content
/// converted to clean Markdown, plus provenance metadata.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct WebClip {
    pub title: String,
    pub site: String,
    pub url: String,
    pub markdown: String,
    pub fetched_at: String,
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
    pub tts_base_url: String,

    pub stt_provider: String,
    pub stt_api_key: String,
    pub stt_base_url: String,

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

/// A single note-type registry entry declared by a world's manifest.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct NoteType {
    pub id: String,
    pub label: String,
    pub color: String,
}

/// A single provenance-taxonomy entry declared by a world's manifest.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct ProvenanceType {
    pub id: String,
    pub label: String,
}

/// Per-world theme overrides layered on top of the global Ledger tokens.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct WorldTheme {
    pub palette: Option<String>,
    pub accent: Option<String>,
    pub serif: Option<bool>,
}

/// The world object's manifest (`world.json`). Declares a world's identity,
/// theme, note-type registry, provenance taxonomy, and bible conditioning flag.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct WorldManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub theme: WorldTheme,
    pub note_types: Vec<NoteType>,
    pub provenance_taxonomy: Vec<ProvenanceType>,
    pub bible: bool,
    pub created: String,
}

/// Lightweight identity for the World Shelf (switcher) UI.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct WorldInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub path: String,
    pub last_opened: Option<String>,
}

/// Export TypeScript bindings for all command input/output types.
pub fn export_bindings_to(path: impl AsRef<std::path::Path>) {
    tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<CampaignNote>()
        .typ::<RuleEntry>()
        .typ::<SearchResult>()
        .typ::<SourceEntry>()
        .typ::<WebClip>()
        .typ::<AppSettings>()
        .typ::<VaultSettings>()
        .typ::<TemplateEntry>()
        .typ::<TemplateProperty>()
        .typ::<TemplateAction>()
        .typ::<PluginInfo>()
        .typ::<NoteType>()
        .typ::<ProvenanceType>()
        .typ::<WorldTheme>()
        .typ::<WorldManifest>()
        .typ::<WorldInfo>()
        .dangerously_cast_bigints_to_number()
        .export(specta_typescript::Typescript::default(), path)
        .expect("Failed to export bindings");
}
