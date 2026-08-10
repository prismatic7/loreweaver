//! # World bundle handling (`bundles.rs`)
//!
//! Export a world folder as a portable zip bundle, import a zip back into the
//! campaigns root, and scaffold a new world from a source world's structure
//! (empty dirs + a world.json skeleton, no content).

use crate::worlds;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// Zip the whole world folder at `vault_path` into `dest_zip`.
pub fn export_world_impl(vault_path: &str, dest_zip: &str) -> Result<(), String> {
    let vault = Path::new(vault_path);
    if !vault.is_dir() {
        return Err(format!("World folder does not exist: {}", vault_path));
    }

    let file = std::fs::File::create(dest_zip)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut entries: Vec<PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(vault).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path == vault {
            continue;
        }
        entries.push(path.to_path_buf());
    }
    entries.sort();

    for path in entries {
        let rel = path
            .strip_prefix(vault)
            .map_err(|e| format!("Failed to compute relative path: {}", e))?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(rel_str, options)
                .map_err(|e| format!("Failed to add directory to zip: {}", e))?;
        } else {
            let mut f = std::fs::File::open(&path)
                .map_err(|e| format!("Failed to open file for zipping: {}", e))?;
            zip.start_file(rel_str, options)
                .map_err(|e| format!("Failed to start zip entry: {}", e))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read file for zipping: {}", e))?;
            zip.write_all(&buf)
                .map_err(|e| format!("Failed to write zip entry: {}", e))?;
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;
    Ok(())
}

/// Guard against zip-slip: reject entries with `..` components or absolute paths.
fn safe_zip_entry_name(name: &str) -> Result<PathBuf, String> {
    let normalized = name.replace('\\', "/");
    let p = Path::new(&normalized);
    if p.is_absolute() {
        return Err(format!("Zip entry has absolute path: {}", name));
    }
    for comp in p.components() {
        if let std::path::Component::ParentDir = comp {
            return Err(format!("Zip entry attempts directory traversal: {}", name));
        }
    }
    Ok(p.to_path_buf())
}

/// Open a zip, find and validate its `world.json`, then extract into
/// `campaigns_root/<id>`. Returns the new world path.
pub fn import_world_impl(campaigns_root: &Path, zip_path: &str) -> Result<String, String> {
    let file = std::fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Locate world.json at the archive root (or any depth).
    let mut manifest_index: Option<usize> = None;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        let name = entry.name().replace('\\', "/");
        if name == "world.json" || name.ends_with("/world.json") {
            manifest_index = Some(i);
            break;
        }
    }
    let manifest_index = manifest_index.ok_or_else(|| {
        "Zip does not contain a valid world.json manifest".to_string()
    })?;

    // Read + validate the manifest.
    let mut manifest_bytes = Vec::new();
    {
        let mut entry = archive
            .by_index(manifest_index)
            .map_err(|e| format!("Failed to read manifest entry: {}", e))?;
        entry
            .read_to_end(&mut manifest_bytes)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
    }
    let manifest: crate::WorldManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("world.json is not a valid manifest: {}", e))?;
    worlds::validate_manifest(&manifest)?;

    let world_dir = campaigns_root.join(&manifest.id);
    if world_dir.exists() {
        return Err(format!(
            "A world with id '{}' already exists at {:?}",
            manifest.id, world_dir
        ));
    }
    std::fs::create_dir_all(&world_dir)
        .map_err(|e| format!("Failed to create world dir: {}", e))?;

    // Extract all entries, guarding against zip-slip.
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        let rel = safe_zip_entry_name(entry.name())?;
        let dest = world_dir.join(&rel);
        if !dest.starts_with(&world_dir) {
            return Err(format!("Zip entry escapes world directory: {}", entry.name()));
        }
        if entry.is_dir() {
            std::fs::create_dir_all(&dest)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            let mut out = std::fs::File::create(&dest)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    Ok(world_dir.to_string_lossy().to_string())
}

/// Create `campaigns/<name>` with an empty skeleton (`Worldbuilding/`,
/// `Characters/`, `bible/`) and a world.json. If `source` is given, mirror its
/// directory structure (empty dirs) and copy a world.json skeleton (structure,
/// no content).
pub fn scaffold_world_impl(
    campaigns_root: &Path,
    name: &str,
    source: Option<&str>,
) -> Result<String, String> {
    let world_dir = campaigns_root.join(name);
    if world_dir.exists() {
        return Err(format!("A world named '{}' already exists", name));
    }

    // Base skeleton dirs.
    let base_dirs = ["Worldbuilding", "Characters", "bible"];
    for d in &base_dirs {
        std::fs::create_dir_all(world_dir.join(d))
            .map_err(|e| format!("Failed to create {}: {}", d, e))?;
    }

    // If a source world is given, mirror its directory structure (empty dirs).
    if let Some(src) = source {
        let src_path = Path::new(src);
        if src_path.is_dir() {
            for entry in walkdir::WalkDir::new(src_path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.is_dir() && path != src_path {
                    if let Ok(rel) = path.strip_prefix(src_path) {
                        std::fs::create_dir_all(world_dir.join(rel))
                            .map_err(|e| format!("Failed to mirror dir: {}", e))?;
                    }
                }
            }
        }
    }

    // Write a default manifest (id/name = folder name).
    let manifest = worlds::load_manifest(world_dir.to_str().unwrap())?;
    let json = worlds::manifest_to_json(&manifest)?;
    std::fs::write(world_dir.join(worlds::MANIFEST_FILE), json)
        .map_err(|e| format!("Failed to write world.json: {}", e))?;

    Ok(world_dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zip_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let world = tmp.path().join("roundtrip");
        std::fs::create_dir_all(world.join("Worldbuilding")).unwrap();
        std::fs::create_dir_all(world.join("bible")).unwrap();
        std::fs::write(world.join("Worldbuilding/Note.md"), "# Note\ncontent").unwrap();
        std::fs::write(world.join("bible/TONE.md"), "Grim.").unwrap();
        let manifest = worlds::load_manifest(world.to_str().unwrap()).unwrap();
        std::fs::write(
            world.join(worlds::MANIFEST_FILE),
            worlds::manifest_to_json(&manifest).unwrap(),
        )
        .unwrap();

        let zip_path = tmp.path().join("out.zip");
        export_world_impl(world.to_str().unwrap(), zip_path.to_str().unwrap()).unwrap();

        let campaigns = tmp.path().join("campaigns");
        std::fs::create_dir_all(&campaigns).unwrap();
        let imported = import_world_impl(&campaigns, zip_path.to_str().unwrap()).unwrap();
        let imported_path = Path::new(&imported);
        assert!(imported_path.join("world.json").exists());
        assert!(imported_path.join("Worldbuilding/Note.md").exists());
        assert!(imported_path.join("bible/TONE.md").exists());
        let m = worlds::load_manifest(imported_path.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "roundtrip");
        worlds::validate_manifest(&m).unwrap();
    }

    #[test]
    fn test_scaffold_creates_expected_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let campaigns = tmp.path().join("campaigns");
        std::fs::create_dir_all(&campaigns).unwrap();

        let path = scaffold_world_impl(&campaigns, "new-world", None).unwrap();
        let p = Path::new(&path);
        assert!(p.join("Worldbuilding").is_dir());
        assert!(p.join("Characters").is_dir());
        assert!(p.join("bible").is_dir());
        assert!(p.join("world.json").is_file());
        let m = worlds::load_manifest(p.to_str().unwrap()).unwrap();
        assert_eq!(m.id, "new-world");
    }

    #[test]
    fn test_scaffold_mirrors_source_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let campaigns = tmp.path().join("campaigns");
        std::fs::create_dir_all(&campaigns).unwrap();

        // Source world with a nested structure and a content file.
        let src = tmp.path().join("src-world");
        std::fs::create_dir_all(src.join("Worldbuilding/Cities")).unwrap();
        std::fs::create_dir_all(src.join("Characters")).unwrap();
        std::fs::write(src.join("Worldbuilding/Cities/Oslo.md"), "# Oslo\ncontent").unwrap();

        let path = scaffold_world_impl(&campaigns, "mirror", Some(src.to_str().unwrap())).unwrap();
        let p = Path::new(&path);
        // Structure mirrored (empty dirs).
        assert!(p.join("Worldbuilding/Cities").is_dir());
        assert!(p.join("Characters").is_dir());
        // Content NOT copied.
        assert!(!p.join("Worldbuilding/Cities/Oslo.md").exists());
        assert!(p.join("world.json").is_file());
    }

    #[test]
    fn test_import_rejects_zip_without_valid_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        let campaigns = tmp.path().join("campaigns");
        std::fs::create_dir_all(&campaigns).unwrap();

        // Build a zip with no world.json.
        let zip_path = tmp.path().join("bad.zip");
        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("random.txt", options).unwrap();
            zip.write_all(b"hello").unwrap();
            zip.finish().unwrap();
        }

        let res = import_world_impl(&campaigns, zip_path.to_str().unwrap());
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("world.json"));
    }

    #[test]
    fn test_import_rejects_zip_slip() {
        let tmp = tempfile::tempdir().unwrap();
        let campaigns = tmp.path().join("campaigns");
        std::fs::create_dir_all(&campaigns).unwrap();

        // Build a zip with a valid manifest but a traversal entry.
        let zip_path = tmp.path().join("slip.zip");
        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            let manifest = worlds::default_manifest("slipworld");
            zip.start_file("world.json", options).unwrap();
            zip.write_all(worlds::manifest_to_json(&manifest).unwrap().as_bytes())
                .unwrap();
            zip.start_file("../evil.txt", options).unwrap();
            zip.write_all(b"pwned").unwrap();
            zip.finish().unwrap();
        }

        let res = import_world_impl(&campaigns, zip_path.to_str().unwrap());
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("traversal"));
    }
}
