# Vector Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the hybrid vector search similarity query by eliminating DB-wide linear scans, BLOB deserialization overhead, and N+1 query patterns.

**Architecture:** Implement an in-memory `ChunkCache` in `search.rs` that loads all embeddings and paths in a single join query, lazy-loads on first query, and exposes a thread-safe invalidation function triggered on database modifications.

**Tech Stack:** Rust, SQLite, ONNX.

## Global Constraints

- No external dependency changes in Cargo.toml.
- Rust compilation must remain clean with zero compiler errors.
- Existing unit tests in `db::tests` and `search::tests` must continue to pass.
- Thread-safety must be guaranteed via standard Rust Mutexes.

---

### Task 1: Include `n.path` in `db::get_all_note_chunks`

Modify `db::get_all_note_chunks` to select the note's relative path from the database, eliminating the need to fetch paths individually during search ranking.

**Files:**
- Modify: `src-tauri/src/db.rs:331-357`

**Interfaces:**
- Consumes: `Connection`
- Produces: `Result<Vec<(String, String, Vec<f32>, String, String, String)>>` (where the 6th element is the note path)

- [ ] **Step 1: Update `get_all_note_chunks` in `src-tauri/src/db.rs`**

Change signature and query on lines 331 to 357:
```rust
pub fn get_all_note_chunks(
    conn: &Connection,
) -> Result<Vec<(String, String, Vec<f32>, String, String, String)>> {
    let mut stmt = conn.prepare("SELECT c.id, c.note_id, c.embedding, c.chunk_text, n.title, n.path FROM note_chunks c JOIN notes n ON c.note_id = n.id")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let note_id: String = row.get(1)?;
        let bytes: Vec<u8> = row.get(2)?;
        let chunk_text: String = row.get(3)?;
        let title: String = row.get(4)?;
        let path: String = row.get(5)?;

        let mut embedding = Vec::with_capacity(bytes.len() / 4);
        for chunk in bytes.chunks_exact(4) {
            let arr: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            embedding.push(f32::from_ne_bytes(arr));
        }

        Ok((id, note_id, embedding, chunk_text, title, path))
    })?;

    let mut chunks = Vec::new();
    for r in rows {
        let (id, note_id, embedding, chunk_text, title, path) = r?;
        chunks.push((id, note_id, embedding, chunk_text, title, path));
    }
    Ok(chunks)
}
```

- [ ] **Step 2: Run backend tests to verify compilation**

Run: `cd src-tauri && cargo test`
Expected: Compile error in tests that expect 5-tuple, or success if no mock relies on it. Fix any 5-tuple mismatches in tests to expect the 6-tuple.

- [ ] **Step 3: Commit changes**

```bash
git add src-tauri/src/db.rs
git commit -m "refactor: include path in get_all_note_chunks SELECT query"
```

---

### Task 2: Define `ChunkCache` and cache control in `search.rs`

Implement the in-memory vector cache struct, the static mutex pointer, cache lazy-loader, and invalidation functions.

**Files:**
- Modify: `src-tauri/src/search.rs` (around top-level definitions)

**Interfaces:**
- Consumes: `db::get_all_note_chunks` and `db::get_all_rule_chunks`
- Produces: `invalidate_cache() -> ()`, `get_cache(conn) -> Result<MutexGuard<Option<ChunkCache>>, String>`

- [ ] **Step 1: Add cache structures to `src-tauri/src/search.rs`**

Add these definitions below the static `ENGINE` definition in `src-tauri/src/search.rs`:
```rust
pub struct ChunkCache {
    pub note_chunks: Vec<(String, String, Vec<f32>, String, String, String)>,
    pub rule_chunks: Vec<(String, String, Vec<f32>, String, String, String)>,
}

static CACHE: OnceLock<Mutex<Option<ChunkCache>>> = OnceLock::new();

pub fn invalidate_cache() {
    if let Some(mutex) = CACHE.get() {
        if let Ok(mut guard) = mutex.lock() {
            *guard = None;
        }
    }
}

fn get_cache(conn: &rusqlite::Connection) -> Result<std::sync::MutexGuard<'_, Option<ChunkCache>>, String> {
    let mut guard = CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let note_chunks = db::get_all_note_chunks(conn).map_err(|e| e.to_string())?;
        let rule_chunks = db::get_all_rule_chunks(conn).map_err(|e| e.to_string())?;
        *guard = Some(ChunkCache { note_chunks, rule_chunks });
    }
    Ok(guard)
}
```

- [ ] **Step 2: Verify compiling**

Run: `cd src-tauri && cargo check`
Expected: SUCCESS

- [ ] **Step 3: Commit changes**

```bash
git add src-tauri/src/search.rs
git commit -m "feat: add ChunkCache lazy-loader and invalidate_cache in search.rs"
```

---

### Task 3: Refactor `hybrid_query` to use the cached vector chunks

Rewrite the linear scan loops in `hybrid_query` to scan the in-memory cache directly and eliminate N+1 query patterns.

**Files:**
- Modify: `src-tauri/src/search.rs:500-572`

**Interfaces:**
- Consumes: `get_cache(conn)`
- Produces: Optimized `hybrid_query` output

- [ ] **Step 1: Modify `hybrid_query` in `src-tauri/src/search.rs`**

Replace the notes/rules vector similarity search sections with cache iteration:
```rust
    // --- Vector Similarity Search ---
    let query_vector = match generate_embedding(query_text) {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "Could not embed query: {:?}. Using FTS5 keyword results only.",
                e
            );
            let mut final_results: Vec<super::SearchResult> = best_results.into_values().collect();
            final_results.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            return Ok(final_results);
        }
    };

    let cache_guard = get_cache(conn)?;
    let cache = cache_guard.as_ref().ok_or("Failed to access search cache")?;

    // Query Notes Chunks (vector cache)
    if category == "all" || category == "notes" {
        for (_chunk_id, note_id, chunk_embedding, chunk_text, title, path) in &cache.note_chunks {
            let mut score = 0.0f32;
            let dims = std::cmp::min(query_vector.len(), chunk_embedding.len());
            for d in 0..dims {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                let key = format!("note:{}", title);
                let combined_score = score * 0.7;
                match best_results.get(&key) {
                    Some(existing) if existing.score >= combined_score => {}
                    _ => {
                        best_results.insert(
                            key,
                            super::SearchResult {
                                r#type: "note".to_string(),
                                title: title.clone(),
                                snippet: chunk_text.clone(),
                                score: combined_score,
                                path: path.clone(),
                            },
                        );
                    }
                }
            }
        }
    }

    // Query Rules Chunks (vector cache)
    if category == "all" || category == "rules" {
        for (_chunk_id, rule_id, chunk_embedding, chunk_text, title, source) in &cache.rule_chunks {
            let mut score = 0.0f32;
            let dims = std::cmp::min(query_vector.len(), chunk_embedding.len());
            for d in 0..dims {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                let key = format!("rule:{}", title);
                let combined_score = score * 0.7;
                match best_results.get(&key) {
                    Some(existing) if existing.score >= combined_score => {}
                    _ => {
                        best_results.insert(
                            key,
                            super::SearchResult {
                                r#type: "rule".to_string(),
                                title: title.clone(),
                                snippet: format!("[{}] {}", source, chunk_text),
                                score: combined_score,
                                path: rule_id.clone(),
                            },
                        );
                    }
                }
            }
        }
    }
```

- [ ] **Step 2: Run all backend tests**

Run: `cd src-tauri && cargo test`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add src-tauri/src/search.rs
git commit -m "perf: refactor hybrid_query to use vector cache and remove N+1 queries"
```

---

### Task 4: Hook Cache Invalidation Triggers to Rust Mutations

Add calls to `search::invalidate_cache()` inside mutator handlers in `watcher.rs`, `search.rs` (post vector indexing), and note lifecycle commands in `lib.rs`.

**Files:**
- Modify: `src-tauri/src/watcher.rs`, `src-tauri/src/search.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `search::invalidate_cache`
- Produces: Synchronized Cache Lifecycle

- [ ] **Step 1: Add cache invalidation to watcher sync loops**

In `src-tauri/src/watcher.rs`, add `crate::search::invalidate_cache()` after modifications in the watcher sync process.

- [ ] **Step 2: Add cache invalidation to search indexing functions**

In `src-tauri/src/search.rs`, call `invalidate_cache()` at the end of `index_note_vectors` and `index_all_rules_vectors`.

- [ ] **Step 3: Add cache invalidation to delete/restore lifecycle commands in `src-tauri/src/lib.rs`**

In `src-tauri/src/lib.rs`, call `search::invalidate_cache()` in commands that delete rules, delete rule categories, empty trash, or trash notes:
- `trash_note` / `trash_note_impl`
- `delete_trashed_note`
- `empty_trash`
- `delete_rules_folder`
- `delete_rule`

- [ ] **Step 4: Verify entire workspace compiles and tests pass**

Run: `cd src-tauri && cargo test`
Run: `npm run build && npm run test`
Expected: SUCCESS

- [ ] **Step 5: Commit changes**

```bash
git add src-tauri/src/watcher.rs src-tauri/src/search.rs src-tauri/src/lib.rs
git commit -m "feat: call search::invalidate_cache in notes and rules mutation gates"
```
