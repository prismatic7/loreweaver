//! # World Object manifest handling (`worlds.rs`)
//!
//! Reads, validates, and generates the `world.json` manifest that gives a
//! campaign folder its identity as a World Object. Per-field fallback chain:
//! manifest value → default. If the manifest file is missing entirely, a
//! manifest built entirely from defaults is returned (id/name = folder name).

use crate::export_types::{NoteType, ProvenanceType, WorldManifest, WorldTheme};
use serde_json::Value;
use std::collections::HashSet;

/// The manifest filename inside a world folder.
pub const MANIFEST_FILE: &str = "world.json";

/// Default note-type registry (the 5 legacy types — must keep working).
pub fn default_note_types() -> Vec<NoteType> {
    vec![
        NoteType {
            id: "npc".to_string(),
            label: "Person".to_string(),
            color: "oklch(60% 0.22 340)".to_string(),
        },
        NoteType {
            id: "location".to_string(),
            label: "Place".to_string(),
            color: "oklch(65% 0.2 260)".to_string(),
        },
        NoteType {
            id: "faction".to_string(),
            label: "Org".to_string(),
            color: "oklch(60% 0.15 80)".to_string(),
        },
        NoteType {
            id: "item".to_string(),
            label: "Object".to_string(),
            color: "oklch(70% 0.18 140)".to_string(),
        },
        NoteType {
            id: "event".to_string(),
            label: "Beat".to_string(),
            color: "oklch(75% 0.15 320)".to_string(),
        },
    ]
}

/// Default provenance taxonomy (4 — `speculation` ships for ALL worlds).
pub fn default_provenance_taxonomy() -> Vec<ProvenanceType> {
    vec![
        ProvenanceType {
            id: "canon".to_string(),
            label: "Canon".to_string(),
        },
        ProvenanceType {
            id: "history".to_string(),
            label: "History".to_string(),
        },
        ProvenanceType {
            id: "invention".to_string(),
            label: "Invention".to_string(),
        },
        ProvenanceType {
            id: "speculation".to_string(),
            label: "Speculative".to_string(),
        },
    ]
}

/// Build a manifest entirely from defaults, using `folder_name` for id/name.
pub fn default_manifest(folder_name: &str) -> WorldManifest {
    WorldManifest {
        id: folder_name.to_string(),
        name: folder_name.to_string(),
        description: String::new(),
        icon: String::new(),
        theme: WorldTheme::default(),
        note_types: default_note_types(),
        provenance_taxonomy: default_provenance_taxonomy(),
        bible: true,
        created: chrono::Utc::now().format("%Y-%m-%d").to_string(),
    }
}

/// Serialize a manifest to pretty JSON.
pub fn manifest_to_json(m: &WorldManifest) -> Result<String, String> {
    serde_json::to_string_pretty(m).map_err(|e| format!("Failed to serialize manifest: {}", e))
}

/// Read `<vault_path>/world.json` and apply per-field fallback to defaults.
///
/// If the file is missing, returns a manifest built entirely from defaults
/// (id/name = folder name). Never errors on a missing file.
pub fn load_manifest(vault_path: &str) -> Result<WorldManifest, String> {
    let vault = std::path::Path::new(vault_path);
    let folder_name = vault
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("world")
        .to_string();

    let manifest_path = vault.join(MANIFEST_FILE);
    if !manifest_path.exists() {
        return Ok(default_manifest(&folder_name));
    }

    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read world.json: {}", e))?;
    let raw: Value = serde_json::from_str(&content)
        .map_err(|e| format!("world.json is not valid JSON: {}", e))?;

    let mut m = default_manifest(&folder_name);

    // id / name: fall back to folder name when absent or empty.
    if let Some(Value::String(s)) = raw.get("id") {
        if !s.trim().is_empty() {
            m.id = s.clone();
        }
    }
    if let Some(Value::String(s)) = raw.get("name") {
        if !s.trim().is_empty() {
            m.name = s.clone();
        }
    }
    if let Some(Value::String(s)) = raw.get("description") {
        m.description = s.clone();
    }
    if let Some(Value::String(s)) = raw.get("icon") {
        m.icon = s.clone();
    }

    // theme: optional; all fields optional.
    if let Some(Value::Object(theme)) = raw.get("theme") {
        if let Some(Value::String(s)) = theme.get("palette") {
            m.theme.palette = Some(s.clone());
        }
        if let Some(Value::String(s)) = theme.get("accent") {
            m.theme.accent = Some(s.clone());
        }
        if let Some(Value::Bool(b)) = theme.get("serif") {
            m.theme.serif = Some(*b);
        }
    }

    // note_types: fallback to defaults when absent or empty.
    if let Some(Value::Array(arr)) = raw.get("note_types") {
        if !arr.is_empty() {
            let mut types = Vec::new();
            for v in arr {
                if let Ok(nt) = serde_json::from_value::<NoteType>(v.clone()) {
                    types.push(nt);
                }
            }
            if !types.is_empty() {
                m.note_types = types;
            }
        }
    }

    // provenance_taxonomy: fallback to defaults when absent or empty.
    if let Some(Value::Array(arr)) = raw.get("provenance_taxonomy") {
        if !arr.is_empty() {
            let mut types = Vec::new();
            for v in arr {
                if let Ok(pt) = serde_json::from_value::<ProvenanceType>(v.clone()) {
                    types.push(pt);
                }
            }
            if !types.is_empty() {
                m.provenance_taxonomy = types;
            }
        }
    }

    // bible: default true.
    m.bible = raw
        .get("bible")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // created: optional.
    if let Some(Value::String(s)) = raw.get("created") {
        m.created = s.clone();
    }

    Ok(m)
}

/// Ensure a `world.json` exists for `vault_path`, writing a default manifest
/// only if the file does NOT already exist (additive, never overwrites).
pub fn ensure_manifest(vault_path: &str) -> Result<WorldManifest, String> {
    let manifest_path = std::path::Path::new(vault_path).join(MANIFEST_FILE);
    if !manifest_path.exists() {
        let m = load_manifest(vault_path)?;
        let json = manifest_to_json(&m)?;
        std::fs::write(&manifest_path, json)
            .map_err(|e| format!("Failed to write world.json: {}", e))?;
    }
    load_manifest(vault_path)
}

/// Validate a manifest: non-empty id, non-empty note_types with unique ids,
/// non-empty provenance_taxonomy with unique ids.
pub fn validate_manifest(m: &WorldManifest) -> Result<(), String> {
    if m.id.trim().is_empty() {
        return Err("Manifest id must not be empty".to_string());
    }
    if m.note_types.is_empty() {
        return Err("Manifest note_types must not be empty".to_string());
    }
    let mut seen = HashSet::new();
    for nt in &m.note_types {
        if nt.id.trim().is_empty() {
            return Err("Manifest note_type id must not be empty".to_string());
        }
        if !seen.insert(nt.id.clone()) {
            return Err(format!("Duplicate note_type id: {}", nt.id));
        }
    }
    if m.provenance_taxonomy.is_empty() {
        return Err("Manifest provenance_taxonomy must not be empty".to_string());
    }
    let mut seen = HashSet::new();
    for pt in &m.provenance_taxonomy {
        if pt.id.trim().is_empty() {
            return Err("Manifest provenance id must not be empty".to_string());
        }
        if !seen.insert(pt.id.clone()) {
            return Err(format!("Duplicate provenance id: {}", pt.id));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("my-world");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(
            vault.join(MANIFEST_FILE),
            r#"{
  "id": "fate-of-cthulhu",
  "name": "FATE of Cthulhu",
  "description": "2003 espionage-horror.",
  "icon": "🜁",
  "theme": { "palette": "obsidian-cold", "accent": "oklch(45% 0.12 340)", "serif": true },
  "note_types": [
    { "id": "npc", "label": "Person", "color": "oklch(60% 0.22 340)" },
    { "id": "clue", "label": "Clue", "color": "oklch(55% 0.2 45)" }
  ],
  "provenance_taxonomy": [
    { "id": "canon", "label": "Canon" },
    { "id": "speculation", "label": "Speculative" }
  ],
  "bible": false,
  "created": "2026-08-10"
}"#,
        )
        .unwrap();

        let m = load_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "fate-of-cthulhu");
        assert_eq!(m.name, "FATE of Cthulhu");
        assert_eq!(m.description, "2003 espionage-horror.");
        assert_eq!(m.icon, "🜁");
        assert_eq!(m.theme.palette.as_deref(), Some("obsidian-cold"));
        assert_eq!(m.theme.accent.as_deref(), Some("oklch(45% 0.12 340)"));
        assert_eq!(m.theme.serif, Some(true));
        assert_eq!(m.note_types.len(), 2);
        assert_eq!(m.note_types[1].id, "clue");
        assert_eq!(m.provenance_taxonomy.len(), 2);
        assert!(!m.bible);
        assert_eq!(m.created, "2026-08-10");
        validate_manifest(&m).unwrap();
    }

    #[test]
    fn test_fallback_when_file_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("some-folder");
        std::fs::create_dir_all(&vault).unwrap();

        let m = load_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "some-folder");
        assert_eq!(m.name, "some-folder");
        assert_eq!(m.note_types.len(), 5);
        assert_eq!(m.provenance_taxonomy.len(), 4);
        assert!(m.bible);
        // speculation ships for all worlds
        assert!(m
            .provenance_taxonomy
            .iter()
            .any(|p| p.id == "speculation"));
    }

    #[test]
    fn test_fallback_when_field_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("partial");
        std::fs::create_dir_all(&vault).unwrap();
        // Only id + name present; everything else must fall back to defaults.
        std::fs::write(
            vault.join(MANIFEST_FILE),
            r#"{ "id": "partial", "name": "Partial World" }"#,
        )
        .unwrap();

        let m = load_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "partial");
        assert_eq!(m.name, "Partial World");
        assert_eq!(m.note_types.len(), 5);
        assert_eq!(m.provenance_taxonomy.len(), 4);
        assert!(m.bible);
        assert!(m.theme.palette.is_none());
    }

    #[test]
    fn test_validate_rejects_empty_and_duplicate_ids() {
        let mut m = default_manifest("world");
        m.id = "".to_string();
        assert!(validate_manifest(&m).is_err());

        let mut m = default_manifest("world");
        m.note_types[1].id = m.note_types[0].id.clone();
        assert!(validate_manifest(&m).is_err());

        let mut m = default_manifest("world");
        m.provenance_taxonomy[1].id = m.provenance_taxonomy[0].id.clone();
        assert!(validate_manifest(&m).is_err());

        let mut m = default_manifest("world");
        m.note_types.clear();
        assert!(validate_manifest(&m).is_err());

        let mut m = default_manifest("world");
        m.provenance_taxonomy.clear();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_ensure_manifest_generates_and_does_not_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("gen-world");
        std::fs::create_dir_all(&vault).unwrap();

        // First call generates the file.
        let m = ensure_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "gen-world");
        let manifest_path = vault.join(MANIFEST_FILE);
        assert!(manifest_path.exists());

        // Second call must NOT overwrite an existing file.
        std::fs::write(&manifest_path, r#"{ "id": "custom", "name": "Custom" }"#).unwrap();
        let m2 = ensure_manifest(vault.to_str().unwrap()).unwrap();
        assert_eq!(m2.id, "custom");
        assert_eq!(m2.name, "Custom");
        let on_disk = std::fs::read_to_string(&manifest_path).unwrap();
        assert!(on_disk.contains("custom"), "existing manifest was overwritten");
    }
}
