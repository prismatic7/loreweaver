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

/// A single append-only session ledger entry, written during live play.
///
/// `kind` is a short event tag (`dice_roll`, `note_saved`, `scene_changed`,
/// `ai_answer`, …) and `payload` is a JSON summary. The ledger is cheap and
/// append-only — a write must never block the UI or the agent loop.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct SessionEvent {
    pub id: String,
    pub kind: String,
    pub payload: String,
    pub created_at: i64,
}

/// One Vault Time Machine snapshot of the active vault.
///
/// Snapshots live under `<app_data>/snapshots/<vault>/<id>.zip` with a JSON
/// sidecar holding this metadata, so listing never has to open an archive.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct SnapshotInfo {
    /// Snapshot id (also the zip's file stem): `YYYYMMDDTHHMMSS`, `-2` on collision.
    pub id: String,
    /// Author's label; empty when the snapshot was taken without one.
    pub label: String,
    /// Unix seconds when the snapshot was taken.
    pub created_at: i64,
    /// Size of the zip on disk, in bytes.
    pub size_bytes: i64,
    /// Number of vault files captured (excludes `.trash` and the SQLite index).
    pub file_count: i64,
    /// Vault folder slug the snapshot belongs to.
    pub vault: String,
}

/// One note that a bulk operation could not complete, with the reason.
///
/// Bulk operations are atomic **per note**, never across the batch: a failure
/// names the note it happened to and the rest of the batch proceeds.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct BulkFailure {
    /// Vault-relative path the operation was attempted on.
    pub path: String,
    pub error: String,
}

/// Outcome of a bulk note operation (`trash_notes`, `move_notes`, `tag_notes`).
///
/// `succeeded` holds paths that completed; `failed` holds the rest with reasons.
/// The caller reports the counts and lists the failures — a partially applied
/// batch is a normal result, not an error.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct BulkResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<BulkFailure>,
}

/// One entry in a snapshot ↔ live-vault diff. `kind` is `added`, `modified`, or
/// `removed`, always described from the vault's point of view.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct FileChange {
    /// Vault-relative path, forward-slash separated.
    pub path: String,
    pub kind: String,
}

/// Run Mode's vault-scoped live-play state.
///
/// `scene_note_id` is the note currently "on stage"; `pinned_rule_ids` are the
/// rule ids shown as compact cards in the Run Mode right rail. Both persist
/// under `run.*` keys in `app_settings` (vault-scoped because the DB is
/// re-initialised per vault).
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct RunState {
    #[serde(default)]
    pub scene_note_id: Option<String>,
    #[serde(default)]
    pub pinned_rule_ids: Vec<String>,
}

/// A campaign entity (person/place/faction/thing) and its aliases.
///
/// Entities are extracted from note titles + `aliases` frontmatter; aliases
/// and title collisions collapse into a single entity.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub note_ids: Vec<String>,
}

/// A continuity problem found by the audit (dead actor, date conflict, …).
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct Finding {
    pub id: String,
    /// Detector kind: `dead_actor`, `date_conflict`, `faction_drift`,
    /// `duplicate_entity`, `orphan_thread`.
    pub kind: String,
    /// `high` | `medium` | `low`.
    pub severity: String,
    pub note_ids: Vec<String>,
    /// Human-readable explanation.
    pub evidence: String,
    /// Where to look: `note_path` (or `note_path:line`).
    pub citation: String,
}

/// The full continuity audit result: the entity/alias registry + findings.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct ContinuityReport {
    pub entities: Vec<Entity>,
    pub findings: Vec<Finding>,
}

/// A note semantically related to the target note ("related by meaning").
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct RelatedNote {
    pub note_id: String,
    pub title: String,
    pub path: String,
    /// Cosine similarity (0.0–1.0) against the target note's averaged vector.
    pub score: f32,
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

/// Wrapper returned by `search_vault`: the ranked results plus a flag telling
/// the frontend whether the query was expanded (synonym/fuzzy layer) so it can
/// show an expansion indicator.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub expanded: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct AppSettings {
    pub llm_provider: String,
    pub llm_model: String,
    pub llm_api_key: String,
    pub llm_base_url: String,
    pub llm_temperature: f64,
    pub llm_top_p: f64,
    pub llm_max_tokens: i64,
    pub llm_seed: Option<i64>,

    pub embed_provider: String,
    pub embed_model: String,
    pub embed_api_key: String,
    pub embed_base_url: String,

    pub image_provider: String,
    pub image_model: String,
    pub image_api_key: String,
    pub image_base_url: String,
    pub image_size: String,

    pub tts_provider: String,
    pub tts_api_key: String,
    pub tts_voice: String,
    pub tts_base_url: String,

    pub stt_provider: String,
    pub stt_api_key: String,
    pub stt_base_url: String,

    pub allow_local_providers: bool,

    /// UI type scale (0.9 / 1.0 / 1.15 / 1.3), applied as `--font-scale`.
    /// Defaults to 1.0 for existing vaults.
    #[serde(default = "default_font_scale")]
    pub font_scale: f64,
}

fn default_font_scale() -> f64 {
    1.0
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

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct VaultSettings {
    pub name: Option<String>,
    pub campaign_system: Option<String>,
    pub description: Option<String>,
    pub tag_colors: Option<HashMap<String, String>>,
    /// Per-world image style template: a small block of prompt text that
    /// sets the world's visual aesthetics and tone. Prepended server-side
    /// by `image.rs` when generating images for this world.
    #[serde(default)]
    pub image_style_template: Option<String>,
    /// Per-world predictability override (0.0 = Firm, 1.0 = Wild).
    /// Resolved as: session toggle → world override → global default.
    #[serde(default)]
    pub firm_wild: Option<f64>,
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
    /// Declarative UI panels contributed by this plugin (empty unless the
    /// plugin declares the `"ui"` permission). Rendered by the host, never by
    /// plugin-supplied HTML.
    #[serde(default)]
    pub ui_panels: Vec<UiPanel>,
}

/// A single form field declared by a plugin's `ui` manifest section.
///
/// `field_type` is a closed set: `"text"`, `"textarea"`, `"select"`, `"number"`.
/// Anything else is rejected at discovery time.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct UiField {
    pub key: String,
    pub field_type: String,
    pub label: String,
    #[serde(default)]
    pub options: Vec<String>,
}

/// A single action button declared by a plugin's `ui` manifest section.
///
/// `hook` names the plugin's global hook function invoked with the panel's
/// field values serialized as JSON when the action is clicked.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct UiAction {
    pub id: String,
    pub label: String,
    pub hook: String,
}

/// A declarative UI panel contributed by a plugin.
///
/// The host renders `fields` from this typed schema and invokes `actions` via
/// the existing `execute_plugin_hook` command. Plugins never receive DOM,
/// filesystem, or network handles for their panels — panels are data only.
#[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
pub struct UiPanel {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub fields: Vec<UiField>,
    #[serde(default)]
    pub actions: Vec<UiAction>,
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
    /// Pinned bible files (e.g. ["TONE.md", "RULES.md"]). Empty = the canon
    /// 8-file set is active (backward compatible).
    #[serde(default)]
    pub bible_files: Vec<String>,
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

/// A single context item attached to an Architect chat turn.
///
/// `kind` is one of `"note"`, `"rule"`, or `"text"`. Notes and rules are
/// resolved by id against the active vault; text items carry raw content.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct ContextItem {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub content: String,
}

/// A tool the Architect may call during a turn.
///
/// `parameters` is a JSON Schema object describing the arguments.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    #[specta(type = specta_typescript::Unknown)]
    pub parameters: serde_json::Value,
}

/// A single chat turn sent to the Architect (user or assistant).
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

/// A tool call requested by the model mid-stream.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// A tool call awaiting explicit user approval before execution.
///
/// Emitted when the agent requests a write (e.g. `save_note`). The frontend
/// renders an Approve/Reject banner; the user's decision is delivered via
/// `approve_agent_tool` / `reject_agent_tool` with the same `run_id` and
/// `tool_call_id`.
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct PendingToolApproval {
    pub run_id: String,
    pub tool_call_id: String,
    pub name: String,
    pub arguments: String,
    /// Human-readable summary of what the tool will do (path, title, size).
    pub summary: String,
}

/// Streaming events emitted by `orchestrate_agent_stream`.
///
/// The frontend receives these over a Tauri `Channel` and renders them as
/// collapsible thinking blocks, tool-call blocks, and streamed text.
#[derive(Serialize, Clone, Debug, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    /// A reasoning/thinking fragment (streamed).
    Reasoning { delta: String },
    /// A tool call was requested by the model.
    ToolCall {
        id: String,
        name: String,
        arguments: String,
    },
    /// A tool call completed with its result.
    ToolResult {
        id: String,
        name: String,
        result: String,
    },
    /// A text fragment of the final answer (streamed).
    Delta { text: String },
    /// The turn completed; `text` is the full final answer.
    Done { text: String },
    /// A non-fatal error; the turn continues.
    Error { message: String },
    /// A write tool is paused awaiting user approval. The turn is blocked
    /// until `approve_agent_tool` / `reject_agent_tool` resolves it.
    ToolApprovalRequired { approval: PendingToolApproval },
}

/// Export TypeScript bindings for all command input/output types.
#[allow(dead_code)]
pub fn export_bindings_to(path: impl AsRef<std::path::Path>) {
    tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<CampaignNote>()
        .typ::<RuleEntry>()
        .typ::<SearchResult>()
        .typ::<SearchResponse>()
        .typ::<SourceEntry>()
        .typ::<SessionEvent>()
        .typ::<SnapshotInfo>()
        .typ::<FileChange>()
        .typ::<BulkFailure>()
        .typ::<BulkResult>()
        .typ::<RunState>()
        .typ::<Entity>()
        .typ::<Finding>()
        .typ::<ContinuityReport>()
        .typ::<RelatedNote>()
        .typ::<WebClip>()
        .typ::<AppSettings>()
        .typ::<VaultSettings>()
        .typ::<TemplateEntry>()
        .typ::<TemplateProperty>()
        .typ::<TemplateAction>()
        .typ::<PluginInfo>()
        .typ::<UiField>()
        .typ::<UiAction>()
        .typ::<UiPanel>()
        .typ::<NoteType>()
        .typ::<ProvenanceType>()
        .typ::<WorldTheme>()
        .typ::<WorldManifest>()
        .typ::<WorldInfo>()
        .typ::<ContextItem>()
        .typ::<ToolSpec>()
        .typ::<ChatTurn>()
        .typ::<ToolCall>()
        .typ::<PendingToolApproval>()
        .typ::<AgentEvent>()
        .dangerously_cast_bigints_to_number()
        .export(specta_typescript::Typescript::default(), path)
        .expect("Failed to export bindings");
}
