//! # Cross-world search (F4.4)
//!
//! Fan-out across every world folder under the campaigns root, without a global
//! index (D7).
//!
//! ### Two passes, deliberately separate
//! - **Structural** (titles / tags / paths): reads each world's markdown files
//!   directly, so a world you have not opened since editing still answers
//!   truthfully. No DB, no embeddings, no staleness.
//! - **Semantic**: reuses the *process-global* embedding model (loaded once at
//!   startup) and each world's own `note_chunks` vectors, opened read-only. No
//!   re-embedding is needed because every world was indexed with the same model,
//!   so the query is embedded once and dot-producted against each world's
//!   stored chunks.
//!
//! Worlds are read-only here: this module never writes a file, never creates a
//! DB, and never switches the active vault.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::{CrossWorldHit, CrossWorldResults, Value};

/// A world folder as seen by the fan-out.
pub struct WorldRef {
    /// Folder name — stable id, and what a badge shows when a world has no name.
    pub id: String,
    /// Manifest display name when present.
    pub name: String,
    pub path: PathBuf,
}

/// File suffixes skipped by the structural pass (index, trash, VCS metadata).
const SKIP_SUFFIXES: [&str; 5] = [".db", ".db-wal", ".db-shm", ".part", ".canvas"];

fn is_skipped(rel: &Path) -> bool {
    for comp in rel.components() {
        if let std::path::Component::Normal(part) = comp {
            let part = part.to_string_lossy();
            if part == ".trash" || part == ".git" || part == "node_modules" || part == "_assets" {
                return true;
            }
        }
    }
    let name = rel
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if name == ".DS_Store" {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    SKIP_SUFFIXES.iter().any(|s| lower.ends_with(s))
}

/// World folders under `campaigns_root`, excluding the `_liminal` holding pen.
pub fn world_folders(campaigns_root: &Path) -> Vec<WorldRef> {
    let mut out = Vec::new();
    let read = match std::fs::read_dir(campaigns_root) {
        Ok(read) => read,
        Err(_) => return out,
    };
    for entry in read.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        if id == "_liminal" {
            continue;
        }
        // A folder without a manifest is still a world (manifest is generated on
        // first open); the fan-out should not hide it.
        let name = crate::worlds::load_manifest(path.to_str().unwrap_or_default())
            .map(|manifest| manifest.name)
            .unwrap_or_else(|_| id.clone());
        out.push(WorldRef { id, name, path });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Every note file in a world, vault-relative, sorted.
fn note_files(world: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(world)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter_map(|path| {
            let rel = path.strip_prefix(world).ok()?.to_path_buf();
            if is_skipped(&rel) {
                return None;
            }
            let name = rel.file_name()?.to_string_lossy().to_lowercase();
            if !(name.ends_with(".md") || name.ends_with(".markdown")) {
                return None;
            }
            Some(rel)
        })
        .collect();
    files.sort();
    files
}

/// Tags from a frontmatter map, accepting both stored forms.
fn tags_of(frontmatter: &std::collections::HashMap<String, Value>) -> Vec<String> {
    match frontmatter.get("tags") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.trim().trim_start_matches('#').to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Some(Value::String(raw)) => raw
            .split(',')
            .map(|s| s.trim().trim_start_matches('#').to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn hit(
    world: &WorldRef,
    rel: &Path,
    title: &str,
    tags: &[String],
    kind: &str,
    score: f64,
) -> CrossWorldHit {
    CrossWorldHit {
        world: world.name.clone(),
        world_id: world.id.clone(),
        world_path: world.path.to_string_lossy().to_string(),
        path: rel.to_string_lossy().replace('\\', "/"),
        title: title.to_string(),
        tags: tags.to_vec(),
        kind: kind.to_string(),
        score,
    }
}

/// Title / tag / path matches across every world.
///
/// A file matches when the needle appears in its title, in any of its tags, or
/// in its vault-relative path — the three things a player actually remembers.
/// `kind` reports which of the three hit first, in title → tag → path order.
pub fn search_structural(
    campaigns_root: &Path,
    query: &str,
    per_world_limit: usize,
) -> CrossWorldResults {
    let needle = query.trim().to_lowercase();
    let worlds = world_folders(campaigns_root);
    let mut hits: Vec<CrossWorldHit> = Vec::new();

    if !needle.is_empty() {
        for world in &worlds {
            let mut world_hits = 0usize;
            for rel in note_files(&world.path) {
                if world_hits >= per_world_limit {
                    break;
                }
                let full = world.path.join(&rel);
                let (title, _content, frontmatter) = match crate::watcher::parse_markdown_file(&full)
                {
                    Ok(parsed) => parsed,
                    Err(_) => continue,
                };
                let tags = tags_of(&frontmatter);
                let rel_str = rel.to_string_lossy().replace('\\', "/");

                let kind = if title.to_lowercase().contains(&needle) {
                    "title"
                } else if tags.iter().any(|t| t.to_lowercase().contains(&needle)) {
                    "tag"
                } else if rel_str.to_lowercase().contains(&needle) {
                    "path"
                } else {
                    continue;
                };

                hits.push(hit(world, &rel, &title, &tags, kind, 1.0));
                world_hits += 1;
            }
        }
    }

    CrossWorldResults {
        hits,
        semantic_used: false,
        worlds_scanned: worlds.len() as i64,
    }
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Best chunk score per note in one world, read from that world's own DB.
///
/// Opened **read-only**: a world the user has not touched must never gain a DB
/// merely because they searched. A missing or unreadable DB contributes nothing
/// rather than failing the whole fan-out.
fn semantic_hits_for_world(
    world: &WorldRef,
    query_vector: &[f32],
    threshold: f32,
    limit: usize,
) -> Vec<CrossWorldHit> {
    let db_path = world.path.join("loreweaver_vault.db");
    if !db_path.is_file() {
        return Vec::new();
    }
    let conn = match rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(conn) => conn,
        Err(_) => return Vec::new(),
    };
    let chunks = match crate::db::get_all_note_chunks(&conn) {
        Ok(chunks) => chunks,
        Err(_) => return Vec::new(),
    };

    // (path, title) -> best score across that note's chunks.
    let mut best: std::collections::HashMap<(String, String), f32> = std::collections::HashMap::new();
    for (_id, _note_id, embedding, _chunk_text, title, path) in chunks {
        if embedding.len() != query_vector.len() {
            continue;
        }
        let score = dot(query_vector, &embedding);
        if score < threshold {
            continue;
        }
        let key = (path, title);
        best.entry(key)
            .and_modify(|existing| {
                if score > *existing {
                    *existing = score;
                }
            })
            .or_insert(score);
    }

    let mut scored: Vec<((String, String), f32)> = best.into_iter().collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored
        .into_iter()
        .take(limit)
        .map(|((path, title), score)| {
            let rel = PathBuf::from(&path);
            hit(world, &rel, &title, &[], "semantic", score as f64)
        })
        .collect()
}

/// Structural matches, optionally merged with semantic ones.
///
/// `semantic` is skipped (and reported as not used) when the embedding engine is
/// not loaded — the same honesty rule as `search_vault`: never imply a semantic
/// pass ran when it could not.
pub fn search_all_worlds(
    campaigns_root: &Path,
    query: &str,
    semantic: bool,
    per_world_limit: usize,
) -> Result<CrossWorldResults, String> {
    let mut results = search_structural(campaigns_root, query, per_world_limit);

    if !semantic || query.trim().is_empty() {
        return Ok(results);
    }
    if !crate::search::engine_ready() {
        return Ok(results);
    }

    let query_vector = match crate::search::generate_embedding(query) {
        Ok(vector) => vector,
        Err(_) => return Ok(results),
    };

    let mut seen: HashSet<(String, String)> = results
        .hits
        .iter()
        .map(|h| (h.world_id.clone(), h.path.clone()))
        .collect();

    for world in world_folders(campaigns_root) {
        for semantic_hit in semantic_hits_for_world(&world, &query_vector, 0.4, per_world_limit) {
            let key = (semantic_hit.world_id.clone(), semantic_hit.path.clone());
            if seen.insert(key) {
                results.hits.push(semantic_hit);
            }
        }
    }

    // Structural hits first (they are certain), then semantic by score.
    results.hits.sort_by(|a, b| {
        let rank = |kind: &str| if kind == "semantic" { 1 } else { 0 };
        rank(&a.kind)
            .cmp(&rank(&b.kind))
            .then(b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.world.to_lowercase().cmp(&b.world.to_lowercase()))
            .then(a.path.cmp(&b.path))
    });
    results.semantic_used = true;
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(root: &Path) {
        for world in ["eldoria", "saltmarsh"] {
            let dir = root.join(world);
            std::fs::create_dir_all(dir.join("Characters")).unwrap();
            std::fs::create_dir_all(dir.join(".trash")).unwrap();
        }
        std::fs::write(
            root.join("eldoria/Characters/Vex.md"),
            "---\ntitle: Vex\nfaction: Watch\ntags: [captain, heist]\n---\nbody",
        )
        .unwrap();
        std::fs::write(
            root.join("saltmarsh/Characters/Vex.md"),
            "---\ntitle: Vex the Younger\ntags: smuggler\n---\nbody",
        )
        .unwrap();
        std::fs::write(
            root.join("saltmarsh/Characters/Kade.md"),
            "---\ntitle: Kade\ntags: [heist]\n---\nbody",
        )
        .unwrap();
        std::fs::write(root.join("saltmarsh/.trash/Old.md"), "---\ntitle: Vex\n---\nbody").unwrap();
        std::fs::write(root.join("saltmarsh/not-a-note.txt"), "Vex").unwrap();
        std::fs::create_dir_all(root.join("_liminal/Captures")).unwrap();
        std::fs::write(
            root.join("_liminal/Captures/Pending.md"),
            "---\ntitle: Vex\n---\nbody",
        )
        .unwrap();
    }

    #[test]
    fn finds_title_and_tag_matches_across_worlds() {
        let root = std::env::temp_dir().join("loreweaver_crossworld_structural");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        fixture(&root);

        let results = search_structural(&root, "vex", 40);
        assert_eq!(results.worlds_scanned, 2, "…_liminal must not count as a world");
        assert_eq!(results.semantic_used, false);

        let worlds: Vec<&str> = results.hits.iter().map(|h| h.world_id.as_str()).collect();
        assert!(worlds.contains(&"eldoria"), "missing eldoria hit: {:?}", worlds);
        assert!(worlds.contains(&"saltmarsh"), "missing saltmarsh hit: {:?}", worlds);
        // Only .md files, never the trash, never the _liminal pen, never .txt.
        assert_eq!(results.hits.len(), 2, "unexpected hits: {:?}", worlds);
        assert!(results.hits.iter().all(|h| h.kind == "title"));
        assert!(results.hits.iter().all(|h| !h.path.starts_with(".trash")));

        // Tag search finds both worlds' heist notes, and reports the tag kind.
        let by_tag = search_structural(&root, "heist", 40);
        assert_eq!(by_tag.hits.len(), 2);
        assert!(by_tag.hits.iter().all(|h| h.kind == "tag"));
        // Tags travel with the hit so the UI can show them.
        let vex = by_tag.hits.iter().find(|h| h.world_id == "eldoria").unwrap();
        assert!(vex.tags.contains(&"captain".to_string()));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn matches_paths_and_respects_the_per_world_limit() {
        let root = std::env::temp_dir().join("loreweaver_crossworld_limits");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        fixture(&root);

        // "characters" appears only in the path.
        let by_path = search_structural(&root, "characters", 40);
        assert!(by_path.hits.len() >= 3);
        assert!(by_path.hits.iter().all(|h| h.kind == "path"));

        let limited = search_structural(&root, "characters", 1);
        let saltmarsh = limited.hits.iter().filter(|h| h.world_id == "saltmarsh").count();
        assert_eq!(saltmarsh, 1, "per-world limit not applied");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_empty_query_returns_nothing_but_still_reports_worlds() {
        let root = std::env::temp_dir().join("loreweaver_crossworld_empty");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        fixture(&root);

        let results = search_structural(&root, "   ", 40);
        assert!(results.hits.is_empty());
        assert_eq!(results.worlds_scanned, 2);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn semantic_pass_is_skipped_when_the_engine_is_not_loaded() {
        let root = std::env::temp_dir().join("loreweaver_crossworld_semantic");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        fixture(&root);

        // No engine initialised in tests, so this must degrade to structural
        // results and say so — never claim a semantic pass it did not run.
        let results = search_all_worlds(&root, "vex", true, 40).unwrap();
        if !crate::search::engine_ready() {
            assert!(!results.semantic_used);
        }
        assert!(!results.hits.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }
}
