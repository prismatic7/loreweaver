---
description: "Scan the codebase for missing documentation and update public APIs & README references."
---

# Documentation Workflow

When requested to update or verify codebase documentation:

1. **Verify Public JSDoc/JSDoc**: Check all exported React components and public functions in TypeScript to ensure they have descriptive JSDoc headers specifying arguments and return types.
2. **Verify Rust module docs**: Ensure Rust files have standard inner module doc comments (`//!`) or item doc comments (`///`) detailing execution steps.
3. **Verify README references**: Check if structural changes (like new Tauri command registrations or schema updates) require corresponding updates in `README.md` or files under `docs/`.
4. **Generate update list**: Summarize all updated file comments and structural docs.
