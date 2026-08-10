use std::path::Path;

fn main() {
    tauri_build::build();

    // Generate TypeScript bindings at compile time, writing relative to the workspace root.
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let bindings_path = workspace_root.join("src").join("bindings.ts");
    export_bindings_to(bindings_path);

    // Ensure this build script is re-run when source files defining exported types change.
    println!("cargo:rerun-if-changed=src/export_types.rs");
}

// Shared type definitions. This file is also a normal module under src/, so it is
// the single source of truth for both runtime code and the build-time exporter.
include!("src/export_types.rs");
