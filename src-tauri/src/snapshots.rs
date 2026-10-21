//! # Vault Time Machine (`snapshots.rs`)
//!
//! Bounded, local-only snapshots of the active campaign vault, plus the diff and
//! single-note restore paths built on top of them.
//!
//! ### Safety model
//! - Snapshots live **outside** the vault, under `<app_data>/snapshots/<vault>/`,
//!   so a snapshot can never be picked up by the vault watcher or indexed.
//! - Restores write exactly one file, always through `validate_safe_path`, so a
//!   corrupt or hostile zip cannot traverse out of the vault.
//! - Zip entry names are re-validated on read (`safe_entry_name`) — the archive
//!   is not trusted just because we wrote it.
//! - Retention is a hard cap (`DEFAULT_RETENTION`); pruning happens after every
//!   successful snapshot so the directory cannot grow without bound.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::{FileChange, SnapshotInfo};

/// How many snapshots are kept per vault unless the caller asks otherwise.
pub const DEFAULT_RETENTION: usize = 20;

/// Subdirectory of the app data dir that holds every vault's snapshots.
pub const SNAPSHOTS_DIR_NAME: &str = "snapshots";

/// `app_settings` key holding the per-vault snapshot retention (default 20).
pub const RETENTION_SETTING_KEY: &str = "snapshots.retention";

/// Directories that are never snapshotted. `.trash` is its own escape hatch and
/// `.git` is version-control metadata, not world content.
const EXCLUDED_DIRS: [&str; 3] = [".trash", ".git", "node_modules"];

/// File-name suffixes that are never snapshotted: the SQLite index and its WAL
/// sidecars are rebuildable, continuously written, and would bloat every zip.
const EXCLUDED_SUFFIXES: [&str; 4] = [".db", ".db-wal", ".db-shm", ".part"];

/// Exact file names that are never snapshotted.
const EXCLUDED_NAMES: [&str; 2] = [".DS_Store", ".loreweaver-snapshot"];

/// Resolves the snapshot root from the campaigns root: campaigns are
/// `<app_data>/campaigns/<world>`, so snapshots sit beside them in
/// `<app_data>/snapshots`. Falls back to a sibling folder when the campaigns
/// root has no parent (only reachable in tests with a bare relative path).
pub fn snapshots_root_for(campaigns_root: &Path) -> PathBuf {
    match campaigns_root.parent() {
        Some(parent) => parent.join(SNAPSHOTS_DIR_NAME),
        None => campaigns_root.join(SNAPSHOTS_DIR_NAME),
    }
}

/// Folder-safe slug for a vault path (its final component, sanitised).
pub fn vault_slug(vault_path: &str) -> Result<String, String> {
    let vault = Path::new(vault_path);
    let name = vault
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Vault path has no folder name: {}", vault_path))?;
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if slug.is_empty() {
        return Err("Vault folder name produced an empty slug".to_string());
    }
    Ok(slug)
}

fn snapshots_dir(vault_path: &str, snapshots_root: &Path) -> Result<PathBuf, String> {
    Ok(snapshots_root.join(vault_slug(vault_path)?))
}

/// True when a vault-relative path must be left out of a snapshot.
fn is_excluded(rel: &Path) -> bool {
    for comp in rel.components() {
        if let std::path::Component::Normal(part) = comp {
            let part = part.to_string_lossy();
            if EXCLUDED_DIRS.contains(&part.as_ref()) {
                return true;
            }
        }
    }
    let name = rel
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if EXCLUDED_NAMES.contains(&name.as_str()) {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    EXCLUDED_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

/// Vault-relative paths of every file that belongs in a snapshot, sorted.
fn collect_files(vault: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(vault)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = match path.strip_prefix(vault) {
            Ok(rel) => rel.to_path_buf(),
            Err(_) => continue,
        };
        if is_excluded(&rel) {
            continue;
        }
        files.push(rel);
    }
    files.sort();
    Ok(files)
}

/// FNV-1a 64-bit over the bytes, length folded in.
///
/// Deliberately hand-rolled rather than a hash crate: both sides of a diff are
/// computed in one process, the inputs are local files, and a 64-bit digest plus
/// length is ample for change detection (this is not a security boundary).
fn content_hash(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash ^ (bytes.len() as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

/// Rejects zip entries with absolute paths or `..` components (zip-slip).
fn safe_entry_name(name: &str) -> Result<PathBuf, String> {
    let normalized = name.replace('\\', "/");
    let path = Path::new(&normalized);
    if path.is_absolute() {
        return Err(format!("Snapshot entry has an absolute path: {}", name));
    }
    for comp in path.components() {
        if let std::path::Component::ParentDir = comp {
            return Err(format!(
                "Snapshot entry attempts directory traversal: {}",
                name
            ));
        }
    }
    Ok(path.to_path_buf())
}

fn read_zip_entry(entry: &mut zip::read::ZipFile<'_>) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    entry
        .read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read snapshot entry: {}", e))?;
    Ok(buf)
}

fn open_snapshot(path: &Path) -> Result<zip::ZipArchive<std::fs::File>, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open snapshot {:?}: {}", path, e))?;
    zip::ZipArchive::new(file).map_err(|e| format!("Failed to read snapshot archive: {}", e))
}

/// Sidecar metadata written next to each zip so labels survive without parsing
/// archive comments. Missing or unreadable sidecars degrade to the file's own
/// metadata rather than failing the listing.
fn sidecar_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.json", id))
}

fn write_sidecar(dir: &Path, info: &SnapshotInfo) -> Result<(), String> {
    let json = serde_json::to_string_pretty(info)
        .map_err(|e| format!("Failed to serialise snapshot metadata: {}", e))?;
    std::fs::write(sidecar_path(dir, &info.id), json)
        .map_err(|e| format!("Failed to write snapshot metadata: {}", e))
}

fn read_sidecar(dir: &Path, id: &str) -> Option<SnapshotInfo> {
    let raw = std::fs::read_to_string(sidecar_path(dir, id)).ok()?;
    serde_json::from_str::<SnapshotInfo>(&raw).ok()
}

/// Next free snapshot id: `YYYYMMDDTHHMMSS`, with `-2`, `-3`, … on collision
/// (two snapshots inside one second, e.g. a test or a rapid double-click).
fn next_snapshot_id(dir: &Path) -> String {
    let base = chrono::Local::now().format("%Y%m%dT%H%M%S").to_string();
    if !dir.join(format!("{}.zip", base)).exists() {
        return base;
    }
    for n in 2..1000 {
        let candidate = format!("{}-{}", base, n);
        if !dir.join(format!("{}.zip", candidate)).exists() {
            return candidate;
        }
    }
    // Pathological fallback — nanosecond precision is always unique enough.
    format!("{}-{}", base, chrono::Local::now().timestamp_nanos_opt().unwrap_or(0))
}

/// Writes a zip of the vault to `dest` using the snapshot exclusion rules.
fn write_snapshot_zip(vault: &Path, dest: &Path, files: &[PathBuf]) -> Result<u64, String> {
    let file = std::fs::File::create(dest)
        .map_err(|e| format!("Failed to create snapshot file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for rel in files {
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let bytes = std::fs::read(vault.join(rel))
            .map_err(|e| format!("Failed to read {} for snapshot: {}", rel_str, e))?;
        zip.start_file(rel_str, options)
            .map_err(|e| format!("Failed to start snapshot entry: {}", e))?;
        zip.write_all(&bytes)
            .map_err(|e| format!("Failed to write snapshot entry: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalise snapshot: {}", e))?;
    let size = std::fs::metadata(dest)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to stat snapshot: {}", e))?;
    Ok(size)
}

/// Creates a snapshot of `vault_path`, prunes beyond `keep`, returns its info.
///
/// The zip is written to a `.part` file and renamed into place, so a crash or a
/// full disk never leaves a truncated archive that `list_snapshots` would offer
/// to restore from.
pub fn create_snapshot_impl(
    vault_path: &str,
    snapshots_root: &Path,
    label: &str,
    keep: usize,
) -> Result<SnapshotInfo, String> {
    let vault = Path::new(vault_path);
    if !vault.is_dir() {
        return Err(format!("Vault folder does not exist: {}", vault_path));
    }
    let dir = snapshots_dir(vault_path, snapshots_root)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;

    let files = collect_files(vault)?;
    let id = next_snapshot_id(&dir);
    let part = dir.join(format!("{}.zip.part", id));
    let final_path = dir.join(format!("{}.zip", id));

    let size_bytes = write_snapshot_zip(vault, &part, &files)?;
    std::fs::rename(&part, &final_path)
        .map_err(|e| format!("Failed to finalise snapshot file: {}", e))?;

    let info = SnapshotInfo {
        id,
        label: label.trim().to_string(),
        created_at: chrono::Local::now().timestamp(),
        size_bytes: size_bytes as i64,
        file_count: files.len() as i64,
        vault: vault_slug(vault_path)?,
    };
    write_sidecar(&dir, &info)?;

    prune_snapshots(&dir, keep.max(1))?;
    Ok(info)
}

/// Deletes the oldest snapshots (and their sidecars) until at most `keep` remain.
fn prune_snapshots(dir: &Path, keep: usize) -> Result<(), String> {
    let mut snapshots = list_in_dir(dir);
    if snapshots.len() <= keep {
        return Ok(());
    }
    // Newest first; everything past `keep` goes.
    for info in snapshots.split_off(keep) {
        let zip = dir.join(format!("{}.zip", info.id));
        let meta = sidecar_path(dir, &info.id);
        let _ = std::fs::remove_file(&zip);
        let _ = std::fs::remove_file(&meta);
    }
    Ok(())
}

/// Snapshots present in `dir`, newest first.
fn list_in_dir(dir: &Path) -> Vec<SnapshotInfo> {
    let read = match std::fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<SnapshotInfo> = Vec::new();
    for entry in read.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "zip") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(stem) => stem.to_string(),
            None => continue,
        };
        if let Some(info) = read_sidecar(dir, &id) {
            out.push(info);
            continue;
        }
        // Sidecar lost — fall back to what the filesystem can tell us.
        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let created = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push(SnapshotInfo {
            id,
            label: String::new(),
            created_at: created,
            size_bytes: size,
            file_count: 0,
            vault: String::new(),
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    out
}

/// Lists a vault's snapshots, newest first.
pub fn list_snapshots_impl(
    vault_path: &str,
    snapshots_root: &Path,
) -> Result<Vec<SnapshotInfo>, String> {
    Ok(list_in_dir(&snapshots_dir(vault_path, snapshots_root)?))
}

/// Compares a snapshot against the live vault: added / modified / removed.
pub fn snapshot_diff_impl(
    vault_path: &str,
    snapshots_root: &Path,
    id: &str,
) -> Result<Vec<FileChange>, String> {
    let vault = Path::new(vault_path);
    if !vault.is_dir() {
        return Err(format!("Vault folder does not exist: {}", vault_path));
    }
    let dir = snapshots_dir(vault_path, snapshots_root)?;
    let zip_path = dir.join(format!("{}.zip", id));
    if !zip_path.is_file() {
        return Err(format!("Snapshot not found: {}", id));
    }

    let mut archive = open_snapshot(&zip_path)?;
    let mut snapshot_hashes: Vec<(String, u64)> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read snapshot entry: {}", e))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        if safe_entry_name(&name).is_err() {
            continue;
        }
        let bytes = read_zip_entry(&mut entry)?;
        snapshot_hashes.push((name, content_hash(&bytes)));
    }

    let mut current_hashes: Vec<(String, u64)> = Vec::new();
    for rel in collect_files(vault)? {
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let bytes = match std::fs::read(vault.join(&rel)) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        current_hashes.push((rel_str, content_hash(&bytes)));
    }

    let mut changes: Vec<FileChange> = Vec::new();
    for (path, hash) in &snapshot_hashes {
        match current_hashes.iter().find(|(p, _)| p == path) {
            None => changes.push(FileChange {
                path: path.clone(),
                kind: "removed".to_string(),
            }),
            Some((_, current)) if current != hash => changes.push(FileChange {
                path: path.clone(),
                kind: "modified".to_string(),
            }),
            Some(_) => {}
        }
    }
    for (path, _) in &current_hashes {
        if !snapshot_hashes.iter().any(|(p, _)| p == path) {
            changes.push(FileChange {
                path: path.clone(),
                kind: "added".to_string(),
            });
        }
    }

    changes.sort_by(|a, b| a.kind.cmp(&b.kind).then(a.path.cmp(&b.path)));
    Ok(changes)
}

/// Restores a single file from a snapshot into the live vault.
///
/// The only write path in this module: it resolves `rel_path` through
/// `validate_safe_path`, so a hostile archive entry cannot escape the vault, and
/// it never deletes anything — restoring is always additive.
pub fn restore_note_from_snapshot_impl(
    vault_path: &str,
    snapshots_root: &Path,
    id: &str,
    rel_path: &str,
) -> Result<(), String> {
    let dir = snapshots_dir(vault_path, snapshots_root)?;
    let zip_path = dir.join(format!("{}.zip", id));
    if !zip_path.is_file() {
        return Err(format!("Snapshot not found: {}", id));
    }

    let mut archive = open_snapshot(&zip_path)?;
    let wanted = safe_entry_name(rel_path)?.to_string_lossy().replace('\\', "/");
    let mut contents: Option<Vec<u8>> = None;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read snapshot entry: {}", e))?;
        if entry.is_dir() {
            continue;
        }
        if entry.name().replace('\\', "/") == wanted {
            contents = Some(read_zip_entry(&mut entry)?);
            break;
        }
    }
    let contents = contents.ok_or_else(|| format!("{} is not in snapshot {}", rel_path, id))?;

    // Validate (and canonicalise) only after the bytes are in hand, so a bad
    // archive is rejected before anything touches the filesystem.
    let safe = crate::validate_safe_path(vault_path, &wanted)?;
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create restore directory: {}", e))?;
    }
    std::fs::write(&safe, contents)
        .map_err(|e| format!("Failed to restore {}: {}", rel_path, e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_vault(tmp: &tempfile::TempDir) -> PathBuf {
        let vault = tmp.path().join("campaigns/eldoria");
        std::fs::create_dir_all(vault.join("Worldbuilding")).unwrap();
        std::fs::create_dir_all(vault.join("Characters")).unwrap();
        std::fs::create_dir_all(vault.join(".trash")).unwrap();
        std::fs::write(vault.join("Worldbuilding/Oslo.md"), "# Oslo\noriginal\n").unwrap();
        std::fs::write(vault.join("Characters/Vex.md"), "# Vex\ncaptain\n").unwrap();
        std::fs::write(vault.join(".trash/Deleted.md"), "gone\n").unwrap();
        std::fs::write(vault.join("loreweaver_vault.db"), b"index").unwrap();
        vault
    }

    #[test]
    fn test_snapshot_create_diff_restore_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = fixture_vault(&tmp);
        let vault_str = vault.to_str().unwrap();
        let root = snapshots_root_for(&tmp.path().join("campaigns"));

        let info = create_snapshot_impl(vault_str, &root, "Before the fire", DEFAULT_RETENTION).unwrap();
        assert_eq!(info.label, "Before the fire");
        // .trash and the SQLite index are excluded; the two notes remain.
        assert_eq!(info.file_count, 2);
        assert!(root.join("eldoria").join(format!("{}.zip", info.id)).is_file());

        // Mutate the vault three ways.
        std::fs::write(vault.join("Worldbuilding/Oslo.md"), "# Oslo\nburned\n").unwrap();
        std::fs::write(vault.join("Characters/New.md"), "# New\n").unwrap();
        std::fs::remove_file(vault.join("Characters/Vex.md")).unwrap();

        let diff = snapshot_diff_impl(vault_str, &root, &info.id).unwrap();
        let kinds: Vec<(String, String)> = diff
            .iter()
            .map(|c| (c.kind.clone(), c.path.clone()))
            .collect();
        assert!(kinds.contains(&("modified".to_string(), "Worldbuilding/Oslo.md".to_string())));
        assert!(kinds.contains(&("added".to_string(), "Characters/New.md".to_string())));
        assert!(kinds.contains(&("removed".to_string(), "Characters/Vex.md".to_string())));

        restore_note_from_snapshot_impl(vault_str, &root, &info.id, "Worldbuilding/Oslo.md").unwrap();
        assert_eq!(
            std::fs::read_to_string(vault.join("Worldbuilding/Oslo.md")).unwrap(),
            "# Oslo\noriginal\n"
        );
        // Restoring the removed note is additive, not destructive.
        restore_note_from_snapshot_impl(vault_str, &root, &info.id, "Characters/Vex.md").unwrap();
        assert!(vault.join("Characters/Vex.md").is_file());
        assert!(vault.join("Characters/New.md").is_file());

        // After both restores only the addition remains in the diff.
        let after = snapshot_diff_impl(vault_str, &root, &info.id).unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].path, "Characters/New.md");
    }

    #[test]
    fn test_snapshot_retention_prunes_oldest() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = fixture_vault(&tmp);
        let vault_str = vault.to_str().unwrap();
        let root = snapshots_root_for(&tmp.path().join("campaigns"));

        let mut ids = Vec::new();
        for n in 0..3 {
            std::fs::write(vault.join("Worldbuilding/Oslo.md"), format!("# Oslo\n{}\n", n))
                .unwrap();
            ids.push(create_snapshot_impl(vault_str, &root, &format!("snap {}", n), 2).unwrap().id);
        }

        let listed = list_snapshots_impl(vault_str, &root).unwrap();
        assert_eq!(listed.len(), 2, "retention should keep exactly two");
        assert!(!listed.iter().any(|s| s.id == ids[0]), "oldest snapshot must be pruned");
        // Pruning removes the sidecar too, so listings never reference a dead zip.
        let dir = root.join("eldoria");
        assert!(!sidecar_path(&dir, &ids[0]).exists());
    }

    #[test]
    fn test_restore_rejects_path_outside_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = fixture_vault(&tmp);
        let vault_str = vault.to_str().unwrap();
        let root = snapshots_root_for(&tmp.path().join("campaigns"));
        let info = create_snapshot_impl(vault_str, &root, "", DEFAULT_RETENTION).unwrap();

        let err = restore_note_from_snapshot_impl(vault_str, &root, &info.id, "../escape.md")
            .unwrap_err();
        assert!(err.contains("traversal"), "unexpected error: {}", err);
        assert!(!tmp.path().join("campaigns/escape.md").exists());
    }

    #[test]
    fn test_restore_missing_entry_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = fixture_vault(&tmp);
        let vault_str = vault.to_str().unwrap();
        let root = snapshots_root_for(&tmp.path().join("campaigns"));
        let info = create_snapshot_impl(vault_str, &root, "", DEFAULT_RETENTION).unwrap();

        let err = restore_note_from_snapshot_impl(vault_str, &root, &info.id, "Nope.md").unwrap_err();
        assert!(err.contains("not in snapshot"), "unexpected error: {}", err);
    }

    #[test]
    fn test_snapshot_excludes_trash_and_db() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = fixture_vault(&tmp);
        let root = snapshots_root_for(&tmp.path().join("campaigns"));
        let info = create_snapshot_impl(vault.to_str().unwrap(), &root, "", DEFAULT_RETENTION).unwrap();

        let mut archive = open_snapshot(&root.join("eldoria").join(format!("{}.zip", info.id))).unwrap();
        let mut names = Vec::new();
        for i in 0..archive.len() {
            names.push(archive.by_index(i).unwrap().name().to_string());
        }
        assert!(names.iter().any(|n| n == "Worldbuilding/Oslo.md"));
        assert!(!names.iter().any(|n| n.contains(".trash")));
        assert!(!names.iter().any(|n| n.ends_with(".db")));
    }
}
