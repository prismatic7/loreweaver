//! Continuity engine: entity/alias registry and contradiction detectors.
//!
//! Everything here is a pure function over `CampaignNote` slices — no DB, no
//! filesystem, no provider calls. The `audit` command wraps `audit()`, and the
//! frontend renders the findings. "Fix" is always a *suggestion*; nothing here
//! auto-writes.

use std::collections::HashMap;

use crate::{CampaignNote, ContinuityReport, Entity, Finding};
use crate::search::levenshtein_distance;

// ── frontmatter helpers ──────────────────────────────────────────────────────

fn fm_str(note: &CampaignNote, key: &str) -> Option<String> {
    note.frontmatter
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn fm_list(note: &CampaignNote, key: &str) -> Vec<String> {
    note.frontmatter
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn note_mentions(note: &CampaignNote, name: &str) -> bool {
    let needle = name.to_lowercase();
    note.content.to_lowercase().contains(&needle)
}

/// Extracts `[[Target]]` / `[[Target|alias]]` wikilink targets from content.
fn wikilink_targets(content: &str) -> Vec<String> {
    let mut targets = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        match after.find("]]") {
            Some(end) => {
                let inner = &after[..end];
                let target = inner.split('|').next().unwrap_or(inner).trim();
                if !target.is_empty() {
                    targets.push(target.to_string());
                }
                rest = &after[end + 2..];
            }
            None => break,
        }
    }
    targets
}

/// Rewrites `[[X]]` / `[[X|alias]]` wikilinks whose target matches any name in
/// `from_names` (case-insensitive) to `[[to_name]]`, preserving any `|alias`.
pub fn rewrite_wikilinks(content: &str, from_names: &[String], to_name: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        let before = &rest[..start];
        let after = &rest[start + 2..];
        match after.find("]]") {
            Some(end) => {
                let inner = &after[..end];
                let (target, alias) = match inner.split_once('|') {
                    Some((t, a)) => (t.trim(), Some(a.trim())),
                    None => (inner.trim(), None),
                };
                out.push_str(before);
                let rewritten = from_names
                    .iter()
                    .any(|n| n.to_lowercase() == target.to_lowercase());
                out.push_str("[[");
                if rewritten {
                    out.push_str(to_name);
                } else {
                    out.push_str(target);
                }
                if let Some(a) = alias {
                    out.push('|');
                    out.push_str(a);
                }
                out.push_str("]]");
                rest = &after[end + 2..];
            }
            None => {
                out.push_str(before);
                out.push_str("[[");
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// The plan for a merge: which note contents change, and the keep note's new
/// aliases. Pure — the `merge_entities` command applies these writes.
pub struct MergePlan {
    /// `(note_id, new_content)` for notes whose content changed (excluding drop).
    pub rewrites: Vec<(String, String)>,
    /// The keep note with `drop`'s title + aliases merged into `aliases`.
    pub keep_note: CampaignNote,
    /// The drop note (to be trashed, not deleted).
    pub drop_note: CampaignNote,
}

/// Computes a merge between two entities (by note id): every wikilink pointing
/// at `drop` (or its aliases) is rewritten to `keep`, and `drop`'s names are
/// folded into `keep`'s aliases. Returns `None` if either id is missing.
pub fn plan_merge(notes: &[CampaignNote], keep_id: &str, drop_id: &str) -> Option<MergePlan> {
    let keep = notes.iter().find(|n| n.id == keep_id)?;
    let drop = notes.iter().find(|n| n.id == drop_id)?;
    if keep.id == drop.id {
        return None;
    }

    let mut drop_names = vec![drop.title.clone()];
    drop_names.extend(fm_list(drop, "aliases"));

    let mut rewrites = Vec::new();
    for note in notes {
        if note.id == drop.id {
            continue;
        }
        let new_content = rewrite_wikilinks(&note.content, &drop_names, &keep.title);
        if new_content != note.content {
            rewrites.push((note.id.clone(), new_content));
        }
    }

    // Fold drop's names into keep's aliases.
    let mut keep_aliases = fm_list(keep, "aliases");
    for name in &drop_names {
        if !keep_aliases.iter().any(|a| a == name) {
            keep_aliases.push(name.clone());
        }
    }
    let mut keep_note = keep.clone();
    keep_note.frontmatter.insert(
        "aliases".to_string(),
        serde_json::Value::Array(
            keep_aliases
                .iter()
                .map(|a| serde_json::Value::String(a.clone()))
                .collect(),
        ),
    );

    Some(MergePlan {
        rewrites,
        keep_note,
        drop_note: drop.clone(),
    })
}

// ── F2.1: entity + alias registry ───────────────────────────────────────────

/// Extracts entities from note titles + `aliases`, collapsing shared names
/// (a title that is another note's alias, or two notes sharing an alias) into
/// one entity.
pub fn extract_entities(notes: &[CampaignNote]) -> Vec<Entity> {
    let n = notes.len();
    let mut parent: Vec<usize> = (0..n).collect();

    fn find(parent: &mut [usize], i: usize) -> usize {
        if parent[i] != i {
            parent[i] = find(parent, parent[i]);
        }
        parent[i]
    }
    fn union(parent: &mut [usize], a: usize, b: usize) {
        let (ra, rb) = (find(parent, a), find(parent, b));
        if ra != rb {
            parent[rb] = ra;
        }
    }

    // Map every lowercased name (title + aliases) to the note that owns it.
    let mut name_to_idx: HashMap<String, usize> = HashMap::new();
    for (i, note) in notes.iter().enumerate() {
        let mut names = vec![note.title.to_lowercase()];
        names.extend(fm_list(note, "aliases").iter().map(|a| a.to_lowercase()));
        for name in names {
            match name_to_idx.get(&name) {
                Some(&j) => union(&mut parent, i, j),
                None => {
                    name_to_idx.insert(name, i);
                }
            }
        }
    }

    // Group notes by their union-find root.
    let mut groups: HashMap<usize, Entity> = HashMap::new();
    for (i, note) in notes.iter().enumerate() {
        let root = find(&mut parent, i);
        let entry = groups.entry(root).or_insert_with(|| Entity {
            id: note.id.clone(),
            name: note.title.clone(),
            aliases: Vec::new(),
            note_ids: Vec::new(),
        });
        for alias in fm_list(note, "aliases") {
            if !entry.aliases.iter().any(|a| a == &alias) {
                entry.aliases.push(alias);
            }
        }
        if !entry.note_ids.contains(&note.id) {
            entry.note_ids.push(note.id.clone());
        }
    }

    let mut entities: Vec<Entity> = groups.into_values().collect();
    entities.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entities
}

// ── F2.2: contradiction detectors ───────────────────────────────────────────

/// A note marked `status: dead` that is still mentioned in a *dated* note.
pub fn detect_dead_actors(notes: &[CampaignNote]) -> Vec<Finding> {
    let mut findings = Vec::new();
    let dead: Vec<&CampaignNote> = notes
        .iter()
        .filter(|n| {
            fm_str(n, "status")
                .map(|s| s.to_lowercase().contains("dead"))
                .unwrap_or(false)
        })
        .collect();

    for entity in &dead {
        let mut names = vec![entity.title.clone()];
        names.extend(fm_list(entity, "aliases"));
        for other in notes {
            if other.id == entity.id {
                continue;
            }
            // Only flag a *dated* mention (a later-dated note referencing the actor).
            let dated = fm_str(other, "date").is_some();
            let mentioned = names.iter().any(|name| note_mentions(other, name));
            if dated && mentioned {
                findings.push(Finding {
                    id: format!("dead_actor-{}", other.id),
                    kind: "dead_actor".into(),
                    severity: "high".into(),
                    note_ids: vec![entity.id.clone(), other.id.clone()],
                    evidence: format!(
                        "{} is marked dead but is mentioned in a dated note.",
                        entity.title
                    ),
                    citation: other.path.clone(),
                });
            }
        }
    }
    findings
}

/// Two events where a `before`/`after` frontmatter edge contradicts their dates.
pub fn detect_date_conflicts(notes: &[CampaignNote]) -> Vec<Finding> {
    let mut findings = Vec::new();

    // Index event notes by lowercased title for before/after resolution.
    let by_title: HashMap<String, &CampaignNote> = notes
        .iter()
        .map(|n| (n.title.to_lowercase(), n))
        .collect();

    for note in notes {
        let date = match fm_str(note, "date") {
            Some(d) => d,
            None => continue,
        };
        for (edge, ref_title) in [("after", fm_str(note, "after")), ("before", fm_str(note, "before"))] {
            let Some(ref_title) = ref_title else { continue };
            let Some(other) = by_title.get(&ref_title.to_lowercase()) else {
                continue;
            };
            let Some(other_date) = fm_str(other, "date") else {
                continue;
            };
            let contradicts = match edge {
                // "X after Y" is wrong if X's date is earlier than Y's.
                "after" => date < other_date,
                // "X before Y" is wrong if X's date is later than Y's.
                "before" => date > other_date,
                _ => false,
            };
            if contradicts {
                findings.push(Finding {
                    id: format!("date_conflict-{}", note.id),
                    kind: "date_conflict".into(),
                    severity: "high".into(),
                    note_ids: vec![note.id.clone(), other.id.clone()],
                    evidence: format!(
                        "{} is dated {} but claims to be {} {} (dated {}).",
                        note.title, date, edge, ref_title, other_date
                    ),
                    citation: note.path.clone(),
                });
            }
        }
    }
    findings
}

/// An entity whose `faction` differs from a note that still mentions it.
pub fn detect_faction_drift(notes: &[CampaignNote]) -> Vec<Finding> {
    let mut findings = Vec::new();
    let entities: Vec<&CampaignNote> = notes
        .iter()
        .filter(|n| fm_str(n, "faction").is_some())
        .collect();

    for entity in &entities {
        let faction = fm_str(entity, "faction").unwrap();
        for other in notes {
            if other.id == entity.id {
                continue;
            }
            if let Some(other_faction) = fm_str(other, "faction") {
                if other_faction != faction && note_mentions(other, &entity.title) {
                    findings.push(Finding {
                        id: format!("faction_drift-{}", other.id),
                        kind: "faction_drift".into(),
                        severity: "medium".into(),
                        note_ids: vec![entity.id.clone(), other.id.clone()],
                        evidence: format!(
                            "{} is faction \"{}\" but \"{}\" (faction \"{}\") still mentions it.",
                            entity.title, faction, other.title, other_faction
                        ),
                        citation: other.path.clone(),
                    });
                }
            }
        }
    }
    findings
}

/// Two entities whose names are near-identical (Levenshtein ≤ 2).
pub fn detect_duplicate_entities(entities: &[Entity]) -> Vec<Finding> {
    let mut findings = Vec::new();
    for i in 0..entities.len() {
        for j in (i + 1)..entities.len() {
            let a = entities[i].name.to_lowercase();
            let b = entities[j].name.to_lowercase();
            if a != b && levenshtein_distance(&a, &b) <= 2 {
                findings.push(Finding {
                    id: format!("duplicate_entity-{}-{}", entities[i].id, entities[j].id),
                    kind: "duplicate_entity".into(),
                    severity: "low".into(),
                    note_ids: vec![entities[i].id.clone(), entities[j].id.clone()],
                    evidence: format!(
                        "\"{}\" and \"{}\" look like the same entity.",
                        entities[i].name, entities[j].name
                    ),
                    citation: entities[i].name.clone(),
                });
            }
        }
    }
    findings
}

/// A note tagged `thread` with no inbound wikilinks and no `status`.
pub fn detect_orphan_threads(notes: &[CampaignNote]) -> Vec<Finding> {
    let mut findings = Vec::new();
    for note in notes {
        let is_thread = fm_str(note, "type")
            .map(|t| t.to_lowercase().contains("thread"))
            .unwrap_or(false)
            || fm_list(note, "tags")
                .iter()
                .any(|t| t.to_lowercase() == "thread");
        if !is_thread {
            continue;
        }
        let has_status = fm_str(note, "status").is_some();
        let inbound = notes
            .iter()
            .filter(|other| {
                other.id != note.id
                    && wikilink_targets(&other.content)
                        .iter()
                        .any(|t| t.to_lowercase() == note.title.to_lowercase())
            })
            .count();
        if !has_status && inbound == 0 {
            findings.push(Finding {
                id: format!("orphan_thread-{}", note.id),
                kind: "orphan_thread".into(),
                severity: "medium".into(),
                note_ids: vec![note.id.clone()],
                evidence: format!(
                    "Thread \"{}\" has no inbound links and no status.",
                    note.title
                ),
                citation: note.path.clone(),
            });
        }
    }
    findings
}

/// Runs the full continuity audit: entity registry + all detectors.
pub fn audit(notes: &[CampaignNote]) -> ContinuityReport {
    let entities = extract_entities(notes);
    let mut findings = Vec::new();
    findings.extend(detect_dead_actors(notes));
    findings.extend(detect_date_conflicts(notes));
    findings.extend(detect_faction_drift(notes));
    findings.extend(detect_duplicate_entities(&entities));
    findings.extend(detect_orphan_threads(notes));
    ContinuityReport { entities, findings }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn note(id: &str, title: &str, frontmatter: serde_json::Value, content: &str) -> CampaignNote {
        CampaignNote {
            id: id.to_string(),
            title: title.to_string(),
            path: format!("Worldbuilding/{}.md", title.replace(' ', "_")),
            frontmatter: frontmatter
                .as_object()
                .unwrap()
                .clone()
                .into_iter()
                .collect(),
            content: content.to_string(),
        }
    }

    #[test]
    fn aliases_collapse_to_one_entity() {
        let notes = vec![
            note("n1", "Vex", json!({ "aliases": ["Captain Vex"] }), ""),
            note("n2", "Captain Vex", json!({}), ""),
        ];
        let entities = extract_entities(&notes);
        assert_eq!(entities.len(), 1, "alias title should collapse");
        assert!(entities[0].note_ids.contains(&"n1".to_string()));
        assert!(entities[0].note_ids.contains(&"n2".to_string()));
    }

    #[test]
    fn non_aliases_stay_distinct() {
        let notes = vec![
            note("n1", "Vex", json!({ "aliases": ["Captain Vex"] }), ""),
            note("n2", "Grog", json!({}), ""),
        ];
        let entities = extract_entities(&notes);
        assert_eq!(entities.len(), 2);
    }

    #[test]
    fn dead_actor_flagged_on_dated_mention() {
        let notes = vec![
            note("n1", "Vex", json!({ "status": "dead" }), ""),
            note("n2", "The Heist", json!({ "date": "2024-06-01" }), "Vex handed us the map."),
        ];
        let findings = detect_dead_actors(&notes);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "dead_actor");
    }

    #[test]
    fn dead_actor_ignored_without_dated_mention() {
        let notes = vec![
            note("n1", "Vex", json!({ "status": "dead" }), ""),
            note("n2", "Unrelated", json!({}), "Grog ate soup."),
        ];
        assert!(detect_dead_actors(&notes).is_empty());
    }

    #[test]
    fn date_conflict_detected() {
        let notes = vec![
            note("n1", "The Battle", json!({ "type": "event", "date": "2024-06-01", "after": "The Siege" }), ""),
            note("n2", "The Siege", json!({ "type": "event", "date": "2024-07-01" }), ""),
        ];
        let findings = detect_date_conflicts(&notes);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "date_conflict");
    }

    #[test]
    fn date_conflict_clean_when_consistent() {
        let notes = vec![
            note("n1", "The Battle", json!({ "type": "event", "date": "2024-08-01", "after": "The Siege" }), ""),
            note("n2", "The Siege", json!({ "type": "event", "date": "2024-07-01" }), ""),
        ];
        assert!(detect_date_conflicts(&notes).is_empty());
    }

    #[test]
    fn faction_drift_detected() {
        let notes = vec![
            note("n1", "Vex", json!({ "faction": "Thieves Guild" }), ""),
            note("n2", "Vex's Betrayal", json!({ "faction": "Crown" }), "Vex sold us out."),
        ];
        let findings = detect_faction_drift(&notes);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "faction_drift");
    }

    #[test]
    fn duplicate_entities_detected() {
        let entities = vec![
            Entity { id: "a".into(), name: "Vex".into(), aliases: vec![], note_ids: vec![] },
            Entity { id: "b".into(), name: "Vexx".into(), aliases: vec![], note_ids: vec![] },
        ];
        let findings = detect_duplicate_entities(&entities);
        assert_eq!(findings.len(), 1);
    }

    #[test]
    fn orphan_thread_detected() {
        let notes = vec![
            note("n1", "The Lost Relic", json!({ "type": "thread" }), "Find the relic."),
        ];
        let findings = detect_orphan_threads(&notes);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "orphan_thread");
    }

    #[test]
    fn orphan_thread_with_inbound_link_is_clean() {
        let notes = vec![
            note("n1", "The Lost Relic", json!({ "type": "thread" }), "Find the relic."),
            note("n2", "Session 3", json!({}), "We chased [[The Lost Relic]]."),
        ];
        assert!(detect_orphan_threads(&notes).is_empty());
    }

    #[test]
    fn audit_aggregates_findings() {
        let notes = vec![
            note("n1", "Vex", json!({ "status": "dead" }), ""),
            note("n2", "Later", json!({ "date": "2024-06-01" }), "Vex returned."),
        ];
        let report = audit(&notes);
        assert!(report.entities.iter().any(|e| e.name == "Vex"));
        assert!(report.findings.iter().any(|f| f.kind == "dead_actor"));
    }

    #[test]
    fn rewrite_wikilinks_maps_aliases_to_keep() {
        let content = "We met [[Captain Vex]] and [[Grog]] at the door.";
        let from = vec!["Vex".to_string(), "Captain Vex".to_string()];
        let out = rewrite_wikilinks(content, &from, "Vex");
        assert_eq!(out, "We met [[Vex]] and [[Grog]] at the door.");
    }

    #[test]
    fn rewrite_wikilinks_preserves_alias() {
        let content = "[[Captain Vex|the captain]] gave the order.";
        let from = vec!["Captain Vex".to_string()];
        let out = rewrite_wikilinks(content, &from, "Vex");
        assert_eq!(out, "[[Vex|the captain]] gave the order.");
    }

    #[test]
    fn plan_merge_rewrites_links_and_merges_aliases() {
        let notes = vec![
            note("n1", "Vex", json!({ "aliases": ["Captain Vex"] }), ""),
            note("n2", "Vexx", json!({}), ""),
            note("n3", "Session 3", json!({}), "We met [[Vexx]] and [[Captain Vex]]."),
        ];
        let plan = plan_merge(&notes, "n1", "n2").unwrap();

        assert_eq!(plan.rewrites.len(), 1);
        assert_eq!(plan.rewrites[0].0, "n3");
        assert_eq!(plan.rewrites[0].1, "We met [[Vex]] and [[Captain Vex]].");

        let aliases = plan.keep_note.frontmatter.get("aliases").unwrap().as_array().unwrap();
        let alias_strs: Vec<&str> = aliases.iter().filter_map(|a| a.as_str()).collect();
        assert!(alias_strs.contains(&"Captain Vex"));
        assert!(alias_strs.contains(&"Vexx"));

        assert_eq!(plan.drop_note.id, "n2");
    }
}
