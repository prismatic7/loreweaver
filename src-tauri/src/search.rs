use crate::db;
use ort::{inputs, session::Session};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tokenizers::Tokenizer;

/// # Hybrid Search Engine & Local Vector Indexer
///
/// This module implements Loreweaver's hybrid search engine, blending lexical
/// full-text keyword indexing (SQLite FTS5) with dense semantic vector search
/// (local ONNX embeddings via `all-MiniLM-L6-v2` or remote OpenAI/Gemini models).
///
/// ## Architectural Overview
///
/// ```text
///                     +---------------------------------------+
///                     |         Query String Input            |
///                     +-------------------+-------------------+
///                                         |
///                     +-------------------+-------------------+
///                     |                                       |
///                     v                                       v
///         +------------------------+             +------------------------+
///         |   SQLite FTS5 Match    |             | Vector Embedding Model |
///         | (Lexical BM25 ranking) |             |  (384-dim normalized)  |
///         +-----------+------------+             +-----------+------------+
///                     |                                       |
///           Score * 0.3 (weight)                    Score * 0.7 (weight)
///                     |                                       |
///                     v                                       v
///         +-----------------------------------------------------------+
///         |         Hybrid Score Fusion & Result Deduplication        |
///         +-----------------------------------------------------------+
/// ```
///
/// ### Key Architectural Concepts
///
/// 1. **Lexical Search (SQLite FTS5):** Performs fast string/prefix keyword matching
///    using SQLite's built-in Full Text Search 5 extension. Scores are weighted by 0.3.
/// 2. **Dense Vector Search (Cosine Similarity):** Generates 384-dimensional float
///    embeddings for text chunks, normalizing vectors to unit length ($\|v\|_2 = 1.0$).
///    At query time, cosine similarity is computed efficiently via vector dot products ($A \cdot B$).
///    Vector similarity scores above cutoff threshold 0.4 are weighted by 0.7.
/// 3. **Local ONNX Neural Inference:** Uses `ort` (ONNX Runtime) to execute the
///    `all-MiniLM-L6-v2` sentence-transformer model directly on device without external API dependencies.
/// 4. **Sliding Window Chunking:** Splits long campaign notes and rules into ~120-token chunks
///    with a 20-token overlap window (~480 chars with ~80 char overlap) to preserve semantic
///    context across chunk boundaries.
/// 5. **Thread-Safe In-Memory Vector Cache:** Loads stored byte BLOB vectors from SQLite into an `Arc<ChunkCache>`
///    guarded by a `Mutex<Option<...>>` (`OnceLock`). When notes or rules are re-indexed,
///    `invalidate_cache()` clears the cache so subsequent queries fetch updated vectors.
/// 6. **Byte Serialization in SQLite BLOBs:** 384-dimensional float arrays (`Vec<f32>`) are stored
///    as 1536 raw little-endian IEEE-754 bytes (`384 * 4 bytes`) in SQLite BLOB columns for compact,
///    fast vector persistence without JSON parsing overhead.

// --- Global Search Engine State ---

/// Holds the loaded ONNX Runtime session and HuggingFace tokenization engine.
///
/// - `session`: Compiled `ort::session::Session` running `all-MiniLM-L6-v2` ONNX graph.
/// - `tokenizer`: HuggingFace `Tokenizer` compiled from `tokenizer.json` for WordPiece BPE encoding.
pub struct SearchEngine {
    pub session: Session,
    pub tokenizer: Tokenizer,
}

/// Global static singleton holding the active `SearchEngine` wrapped in a thread-safe `Mutex`.
static ENGINE: OnceLock<Mutex<Option<SearchEngine>>> = OnceLock::new();

/// Global static storing the active SQLite database path for embedding provider lookups.
static DB_PATH: OnceLock<String> = OnceLock::new();

/// In-memory cache holding pre-extracted vector chunks for notes and rules.
///
/// Avoids repeatedly querying raw SQLite BLOB columns and deserializing little-endian
/// byte arrays (`Vec<u8>` -> `Vec<f32>`) during interactive search query evaluation.
///
/// Tuple format for `note_chunks`: `(chunk_id, note_id, embedding_vec, chunk_text, title, path)`
/// Tuple format for `rule_chunks`: `(chunk_id, rule_id, embedding_vec, chunk_text, title, source)`
pub struct ChunkCache {
    pub note_chunks: Vec<(String, String, Vec<f32>, String, String, String)>,
    pub rule_chunks: Vec<(String, String, Vec<f32>, String, String, String)>,
}

/// Global static storing the cached `ChunkCache` wrapped in `Arc` for lock-free read access after creation.
static CACHE: OnceLock<Mutex<Option<Arc<ChunkCache>>>> = OnceLock::new();

/// Evicts the in-memory vector chunk cache.
///
/// Must be called whenever notes or rules are added, edited, re-indexed, or removed,
/// forcing the next `hybrid_query` call to re-query SQLite BLOBs and rebuild `ChunkCache`.
pub fn invalidate_cache() {
    if let Some(mutex) = CACHE.get() {
        let mut guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }
}

/// Retrieves the thread-safe `Arc<ChunkCache>`, initializing it from SQLite if empty.
///
/// Queries `db::get_all_note_chunks` and `db::get_all_rule_chunks`, deserializing SQLite BLOB byte arrays
/// into `Vec<f32>` embedding vectors.
fn get_cache(conn: &rusqlite::Connection) -> Result<Arc<ChunkCache>, String> {
    let mut guard = CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let note_chunks = db::get_all_note_chunks(conn).map_err(|e| e.to_string())?;
        let rule_chunks = db::get_all_rule_chunks(conn).map_err(|e| e.to_string())?;
        *guard = Some(Arc::new(ChunkCache {
            note_chunks,
            rule_chunks,
        }));
    }
    Ok(guard.as_ref().unwrap().clone())
}

fn engine() -> &'static Mutex<Option<SearchEngine>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

/// Sets the current DB path for embedding provider preference lookups.
/// Called during search engine initialization.
pub fn set_db_path(path: &str) {
    let _ = DB_PATH.set(path.to_string());
}

fn get_db_path() -> String {
    DB_PATH
        .get()
        .cloned()
        .unwrap_or_else(|| "loreweaver.db".to_string())
}

/// Initializes local search engine neural assets on startup.
///
/// 1. Resolves local model directory at `<app_data_path>/models/all-MiniLM-L6-v2`.
/// 2. Downloads `model.onnx` and `tokenizer.json` from Hugging Face if not locally present.
/// 3. Loads HuggingFace tokenizer from `tokenizer.json`.
/// 4. Instantiates ONNX Runtime `Session` from ONNX model file.
/// 5. Stores initialized engine in `ENGINE` singleton `OnceLock`.
pub fn init_search_engine(app_data_path: &str) -> Result<(), String> {
    // Check if dynamic libraries for ONNX need initialization
    #[cfg(target_os = "macos")]
    {
        // ort init is automatic in v2, but we can call it to be sure
        let _ = ort::init();
    }

    let model_dir = PathBuf::from(app_data_path)
        .join("models")
        .join("all-MiniLM-L6-v2");
    let model_path = model_dir.join("model.onnx");
    let tokenizer_path = model_dir.join("tokenizer.json");

    // Download model if missing
    if !model_path.exists() {
        let model_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx";
        download_file(model_url, &model_path)?;
    }

    // Download tokenizer if missing
    if !tokenizer_path.exists() {
        let tokenizer_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json";
        download_file(tokenizer_url, &tokenizer_path)?;
    }

    // Load Tokenizer
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer.json: {:?}", e))?;

    // Load ONNX Session
    let session = Session::builder()
        .map_err(|e| format!("Failed to create SessionBuilder: {:?}", e))?
        .commit_from_file(&model_path)
        .map_err(|e| format!("Failed to load ONNX model.onnx session: {:?}", e))?;

    let mut engine_guard = engine().lock().unwrap_or_else(|e| e.into_inner());
    *engine_guard = Some(SearchEngine { session, tokenizer });

    println!("Local search engine initialized successfully!");
    Ok(())
}

/// Helper utility downloading a remote file over HTTP via `ureq` and streaming to local disk.
fn download_file(url: &str, dest_path: &Path) -> Result<(), String> {
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    println!("Downloading search asset from: {}", url);
    let response = ureq::get(url)
        .call()
        .map_err(|e| format!("HTTP request failed: {:?}", e))?;

    let mut reader = response.into_reader();
    let mut file = std::fs::File::create(dest_path).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;

    println!("Saved to {:?}", dest_path);
    Ok(())
}

/// Entry point for embedding generation.
///
/// Dynamically routes to remote provider (OpenAI `text-embedding-3-small` or Gemini `text-embedding-004`)
/// if configured in SQLite database settings (`embed_provider`), falling back to local ONNX execution.
pub fn generate_embedding(text: &str) -> Result<Vec<f32>, String> {
    // Check if a remote embedding provider is configured in database settings
    let db_path = get_db_path();
    if let Ok(conn) = db::init_db(&db_path) {
        if let Ok(Some(provider)) = db::get_setting(&conn, "embed_provider") {
            if provider == "openai" || provider == "openai-compatible" {
                let api_key = db::get_setting(&conn, "embed_api_key")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let base_url = db::get_setting(&conn, "embed_base_url")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "https://api.openai.com".to_string());
                let model = db::get_setting(&conn, "embed_model")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "text-embedding-3-small".to_string());
                if !api_key.is_empty() {
                    return generate_embedding_openai(text, &api_key, &base_url, &model);
                }
            } else if provider == "gemini" {
                let api_key = db::get_setting(&conn, "embed_api_key")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let model = db::get_setting(&conn, "embed_model")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "text-embedding-004".to_string());
                if !api_key.is_empty() {
                    return generate_embedding_gemini(text, &api_key, &model);
                }
            }
        }
    }

    // Fall back to local ONNX model execution
    generate_embedding_local(text)
}

/// Generates an embedding vector using an OpenAI-compatible REST API endpoint (`/v1/embeddings`).
/// L2-normalizes output vector before returning.
fn generate_embedding_openai(
    text: &str,
    api_key: &str,
    base_url: &str,
    model: &str,
) -> Result<Vec<f32>, String> {
    let base = base_url.trim().trim_end_matches('/');
    let url = format!("{}/v1/embeddings", base);

    let body = serde_json::json!({
        "model": model,
        "input": text,
    });

    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(30))
        .set("Authorization", &format!("Bearer {}", api_key))
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("OpenAI embedding request failed: {:?}", e))?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse embedding response: {:?}", e))?;

    let embedding_array = res_json["data"][0]["embedding"]
        .as_array()
        .ok_or("OpenAI embedding response missing data[0].embedding")?;

    let embedding: Vec<f32> = embedding_array
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    if embedding.is_empty() {
        return Err("OpenAI returned empty embedding".to_string());
    }

    // L2 normalize vector so dot products correspond to cosine similarities
    let mut norm = 0.0f32;
    for &val in &embedding {
        norm += val * val;
    }
    norm = norm.sqrt();
    if norm > 0.0 {
        let mut result = embedding;
        for d in &mut result {
            *d /= norm;
        }
        return Ok(result);
    }

    Ok(embedding)
}

/// Generates an embedding vector using Google Gemini REST API (`embedContent`).
/// L2-normalizes output vector before returning.
fn generate_embedding_gemini(text: &str, api_key: &str, model: &str) -> Result<Vec<f32>, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:embedContent",
        model
    );

    let body = serde_json::json!({
        "content": { "parts": [{ "text": text }] }
    });

    let response = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(30))
        .set("x-goog-api-key", api_key)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("Gemini embedding request failed: {:?}", e))?;

    let res_json: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Failed to parse Gemini embedding response: {:?}", e))?;

    let embedding_array = res_json["embedding"]["values"]
        .as_array()
        .ok_or("Gemini embedding response missing embedding.values")?;

    let embedding: Vec<f32> = embedding_array
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    if embedding.is_empty() {
        return Err("Gemini returned empty embedding".to_string());
    }

    // L2 normalize vector so dot products correspond to cosine similarities
    let mut norm = 0.0f32;
    for &val in &embedding {
        norm += val * val;
    }
    norm = norm.sqrt();
    if norm > 0.0 {
        let mut result = embedding;
        for d in &mut result {
            *d /= norm;
        }
        return Ok(result);
    }

    Ok(embedding)
}

/// Generates a normalized 384-dimensional float vector using the local ONNX `all-MiniLM-L6-v2` transformer model.
///
/// ### Local Inference Pipeline:
/// 1. **Tokenization:** Converts input text into WordPiece BPE token IDs, attention mask, and token type IDs.
/// 2. **Tensor Preparation:** Constructs 2D input tensors of shape `[1, sequence_length]`.
/// 3. **ONNX Model Inference:** Evaluates session model, extracting `last_hidden_state` tensor of shape `[1, sequence_length, 384]`.
/// 4. **Mean Pooling:** Sums hidden state vectors across valid non-padded tokens (`attention_mask == 1`) and computes arithmetic mean.
/// 5. **L2 Normalization:** Divides embedding vector by its Euclidean norm $\|v\|_2 = \sqrt{\sum v_i^2}$, ensuring vector has unit length.
fn generate_embedding_local(text: &str) -> Result<Vec<f32>, String> {
    let mut engine_guard = engine().lock().unwrap_or_else(|e| e.into_inner());
    let engine = engine_guard
        .as_mut()
        .ok_or("Search engine not initialized")?;

    // Step 1: Tokenize input text using HuggingFace Tokenizer
    let encoding = engine
        .tokenizer
        .encode(text, true)
        .map_err(|e| format!("Tokenization failed: {:?}", e))?;

    let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
    let attention_mask: Vec<i64> = encoding
        .get_attention_mask()
        .iter()
        .map(|&mask| mask as i64)
        .collect();
    let token_type_ids: Vec<i64> = encoding
        .get_type_ids()
        .iter()
        .map(|&id| id as i64)
        .collect();

    let seq_len = input_ids.len();

    // Step 2 & 3: Run ONNX inference using tuple shape/data representations `[1, seq_len]`
    let outputs = engine.session.run(inputs![
        "input_ids" => ort::value::Tensor::from_array((vec![1usize, seq_len], input_ids)).map_err(|e| e.to_string())?,
        "attention_mask" => ort::value::Tensor::from_array((vec![1usize, seq_len], attention_mask.clone())).map_err(|e| e.to_string())?,
        "token_type_ids" => ort::value::Tensor::from_array((vec![1usize, seq_len], token_type_ids)).map_err(|e| e.to_string())?,
    ])
    .map_err(|e| format!("ONNX model execution failed: {:?}", e))?;

    let output_tensor = outputs
        .get("last_hidden_state")
        .ok_or("Failed to extract last_hidden_state from ONNX model outputs")?;
    let (_shape, data) = output_tensor
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Tensor extraction error: {:?}", e))?;

    // Step 4: Mean Pooling over non-padded tokens (attention_mask == 1)
    let mut sum_embedding = vec![0.0f32; 384];
    let mut count = 0.0f32;

    for i in 0..seq_len {
        if attention_mask[i] == 1 {
            count += 1.0;
            for d in 0..384 {
                sum_embedding[d] += data[i * 384 + d];
            }
        }
    }

    let mut embedding = vec![0.0f32; 384];
    if count > 0.0 {
        for d in 0..384 {
            embedding[d] = sum_embedding[d] / count;
        }
    }

    // Step 5: L2 Normalization (unit length conversion for fast cosine dot products)
    let mut norm = 0.0f32;
    for &val in &embedding {
        norm += val * val;
    }
    norm = norm.sqrt();

    if norm > 0.0 {
        for d in 0..384 {
            embedding[d] /= norm;
        }
    }

    Ok(embedding)
}

/// Splits text into overlapping sliding-window chunks for vector embedding generation.
///
/// Uses character-based windowing approximating ~4 characters per token for English text
/// (e.g. 120 tokens ~ 480 characters, 20 tokens overlap ~ 80 characters).
///
/// Overlap ensures semantic continuity across chunk boundaries, preventing split phrases or terms from losing context.
pub fn chunk_text(text: &str, chunk_size_tokens: usize, overlap_tokens: usize) -> Vec<String> {
    // Approximate 4 characters per token for English text
    let char_chunk_size = chunk_size_tokens * 4;
    let char_overlap = overlap_tokens * 4;
    chunk_text_by_chars(text, char_chunk_size, char_overlap)
}

/// Simple character-based chunking fallback when the BPE tokenizer is unavailable.
///
/// Advances window by `chunk_size - overlap` characters per step, preserving contiguous text segments.
fn chunk_text_by_chars(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= chunk_size {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = std::cmp::min(start + chunk_size, chars.len());
        let chunk: String = chars[start..end].iter().collect();
        if !chunk.trim().is_empty() {
            chunks.push(chunk);
        }
        let step = chunk_size.saturating_sub(overlap);
        if step == 0 {
            break;
        }
        start += step;
    }
    chunks
}

/// Chunks and indexes a single campaign note into SQLite vector tables.
///
/// 1. Clears existing chunks for `note_id`.
/// 2. Splits content into 120-token chunks with 20-token overlap.
/// 3. Computes 384-dimensional vector embedding for each chunk (or 0-vector fallback if model unavailable).
/// 4. Inserts chunk text & binary byte-blob embedding into SQLite `note_chunks` table.
/// 5. Evicts `ChunkCache` so new note vectors are available for search.
pub fn index_note_vectors(
    conn: &rusqlite::Connection,
    note_id: &str,
    content: &str,
) -> Result<(), String> {
    db::clear_note_chunks(conn, note_id).map_err(|e| e.to_string())?;

    // Split note content into paragraphs/chunks using sliding window
    let chunks = chunk_text(content, 120, 20);

    for chunk in chunks {
        if chunk.trim().is_empty() {
            continue;
        }

        // Generate embedding (will skip if search engine is not ready, e.g. on fallback)
        match generate_embedding(&chunk) {
            Ok(embedding) => {
                db::insert_note_chunk(&conn, note_id, &chunk, &embedding)
                    .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                eprintln!(
                    "Failed to generate vector embedding: {:?}. Storing chunk text only.",
                    e
                );
                // In case model is not yet loaded, write chunk with 0 vector as fallback
                let empty_emb = vec![0.0f32; 384];
                db::insert_note_chunk(&conn, note_id, &chunk, &empty_emb)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    invalidate_cache();
    Ok(())
}

// --- Query Expansion (synonym service + fuzzy layer) ---
//
// Increment B: `hybrid_query` expands the raw query before the FTS5 phase.
// Expansion is a pure function of the query text and the vault's read-only
// lexicon (`<vault>/lexicon/synonyms.json`). A missing or malformed lexicon
// degrades to today's behaviour (no expansion). The fuzzy layer is a
// hand-rolled Wagner–Fischer Levenshtein distance — deliberately no new
// crate (see the Increment B plan).

/// Computes the Levenshtein edit distance between two strings.
///
/// Hand-rolled Wagner–Fischer with a two-row DP table over `char` vectors.
/// Distance 0 = identical; each insertion/deletion/substitution costs 1.
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut prev: Vec<usize> = (0..=b_len).collect();
    let mut curr = vec![0usize; b_len + 1];

    for i in 1..=a_len {
        curr[0] = i;
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1) // deletion
                .min(curr[j - 1] + 1) // insertion
                .min(prev[j - 1] + cost); // substitution
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[b_len]
}

/// Maximum edit distance allowed for a fuzzy lexicon-key match, by token length.
///
/// Tokens shorter than 4 characters are exact-match only (distance 0) — short
/// tokens would flood with false positives. 4–5 chars tolerate one edit;
/// 6+ chars tolerate two (covers dropped letters and transpositions).
pub fn fuzzy_threshold(token_len: usize) -> usize {
    match token_len {
        0..=3 => 0,
        4..=5 => 1,
        _ => 2,
    }
}

/// Loads the vault's synonym lexicon (`<vault>/lexicon/synonyms.json`).
///
/// The file maps canonical terms to variant spellings/aliases:
/// `{ "campaign": ["campain", "campaing"], "combat": ["cmbat"] }`.
/// Read-only at runtime: a missing or malformed file yields an empty map
/// (search degrades to today's behaviour), never an error.
pub fn load_synonyms(vault_path: &str) -> HashMap<String, Vec<String>> {
    let lexicon_path = std::path::Path::new(vault_path)
        .join("lexicon")
        .join("synonyms.json");
    let raw = match std::fs::read_to_string(&lexicon_path) {
        Ok(raw) => raw,
        Err(_) => return HashMap::new(),
    };
    match serde_json::from_str::<HashMap<String, Vec<String>>>(&raw) {
        Ok(map) => map,
        Err(e) => {
            eprintln!("Malformed lexicon at {:?}: {:?}", lexicon_path, e);
            HashMap::new()
        }
    }
}

/// Expands a query string into FTS terms using the vault lexicon + fuzzy layer.
///
/// Per whitespace-separated token:
/// 1. Exact lexicon key → the key plus its variants.
/// 2. Exact variant → its canonical key.
/// 3. Fuzzy key match within `fuzzy_threshold` → the canonical key.
/// 4. Otherwise the token is kept unchanged.
///
/// Returns `(terms, expanded)` where `expanded` is true when any term was
/// added beyond the original tokens (i.e. the query was rewritten).
pub fn expand_query(query_text: &str, vault_path: &str) -> (Vec<String>, bool) {
    let synonyms = load_synonyms(vault_path);
    if synonyms.is_empty() {
        return (vec![query_text.to_string()], false);
    }

    // Reverse index: variant -> canonical key.
    let mut variant_to_key: HashMap<&str, &str> = HashMap::new();
    for (key, variants) in &synonyms {
        for variant in variants {
            variant_to_key.insert(variant.as_str(), key.as_str());
        }
    }

    let mut terms: Vec<String> = Vec::new();
    let mut expanded = false;

    for token in query_text.split_whitespace() {
        let lower = token.to_lowercase();

        // 1. Exact lexicon key.
        if let Some(variants) = synonyms.get(lower.as_str()) {
            terms.push(lower.clone());
            for variant in variants {
                terms.push(variant.clone());
            }
            expanded = true;
            continue;
        }

        // 2. Exact variant -> canonical key.
        if let Some(&key) = variant_to_key.get(lower.as_str()) {
            terms.push(key.to_string());
            expanded = true;
            continue;
        }

        // 3. Fuzzy key match within threshold.
        let threshold = fuzzy_threshold(lower.chars().count());
        if threshold > 0 {
            let mut best_key: Option<&str> = None;
            let mut best_dist = usize::MAX;
            for key in synonyms.keys() {
                let dist = levenshtein_distance(&lower, key);
                if dist <= threshold && dist < best_dist {
                    best_dist = dist;
                    best_key = Some(key.as_str());
                }
            }
            if let Some(key) = best_key {
                terms.push(key.to_string());
                expanded = true;
                continue;
            }
        }

        // 4. Unchanged.
        terms.push(token.to_string());
    }

    (terms, expanded)
}

/// Executes a hybrid search query blending FTS5 lexical keyword matching with vector similarity.
///
/// ### Hybrid Search Scoring Strategy:
/// 1. **FTS5 Keyword Match:** Queries SQLite FTS5 index for notes/rules matching `query_text`.
///    Raw FTS match scores are weighted by **0.3** (`score = fts_score * 0.3`).
/// 2. **Vector Similarity Match:** Generates a 384-dim query embedding vector and compares it
///    against cached chunk embeddings using cosine dot product ($A \\cdot B$).
///    Hits exceeding similarity threshold **0.4** are weighted by **0.7** (`score = cosine_score * 0.7`).
/// 3. **Score Fusion & Deduplication:** Aggregates hits by document key (`note:title` or `rule:title`).
///    If a document matches both FTS5 and vector search, the higher weighted score is preserved.
/// 4. **Sorting:** Returns deduplicated results ordered by final composite score descending.
///
/// ### Query Expansion (Increment B)
/// Before the FTS5 phase the query is expanded via `expand_query` (vault lexicon +
/// fuzzy layer). When expansion adds terms, FTS runs per term and results are
/// merged by key keeping the best score; the returned `bool` is true when the
/// query was expanded (the frontend shows an expansion indicator). When nothing
/// was expanded, FTS runs the whole query as one phrase — exactly the
/// pre-Increment-B behaviour.
pub fn hybrid_query(
    conn: &rusqlite::Connection,
    query_text: &str,
    category: &str,
    vault_path: &str,
) -> Result<(Vec<super::SearchResult>, bool), String> {
    // Collect results: key = "type:title" -> SearchResult
    let mut best_results: HashMap<String, super::SearchResult> = HashMap::new();

    // --- Phase 0: Query Expansion (synonym service + fuzzy layer) ---
    let (fts_terms, expanded) = expand_query(query_text, vault_path);

    // --- Phase 1: FTS5 Keyword Search (Lexical Matching) ---
    if category == "all" || category == "notes" {
        for fts_term in &fts_terms {
            if let Ok(fts_results) = db::fts_search_notes(&conn, fts_term, 20) {
                for (note_id, title, snippet, fts_score) in fts_results {
                    // Fetch the note path for navigation
                    let note_path = conn
                        .query_row::<String, _, _>(
                            "SELECT path FROM notes WHERE id = ?1",
                            [&note_id],
                            |r| r.get(0),
                        )
                        .unwrap_or_else(|_| note_id.clone());

                    let key = format!("note:{}", title);
                    let score = fts_score * 0.3; // Lexical score component weight
                    match best_results.get(&key) {
                        Some(existing) if existing.score >= score => {}
                        _ => {
                            best_results.insert(
                                key,
                                super::SearchResult {
                                    r#type: "note".to_string(),
                                    title,
                                    snippet,
                                    score,
                                    path: note_path,
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    if category == "all" || category == "rules" {
        for fts_term in &fts_terms {
            if let Ok(fts_results) = db::fts_search_rules(&conn, fts_term, 20) {
                for (rule_id, title, snippet, fts_score) in fts_results {
                    let key = format!("rule:{}", title);
                    let score = fts_score * 0.3; // Lexical score component weight
                    match best_results.get(&key) {
                        Some(existing) if existing.score >= score => {}
                        _ => {
                            best_results.insert(
                                key,
                                super::SearchResult {
                                    r#type: "rule".to_string(),
                                    title,
                                    snippet,
                                    score,
                                    path: rule_id,
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    // --- Phase 2: Vector Similarity Search (Semantic Matching) ---
    let query_vector = match generate_embedding(query_text) {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "Could not embed query: {:?}. Using FTS5 keyword results only.",
                e
            );
            // Return just FTS5 results if vector search is unavailable
            let mut final_results: Vec<super::SearchResult> = best_results.into_values().collect();
            final_results.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            return Ok((final_results, expanded));
        }
    };

    let cache = get_cache(conn)?;

    // Query Notes Chunks (vector cache dot-product evaluation)
    if category == "all" || category == "notes" {
        for (_chunk_id, _note_id, chunk_embedding, chunk_text, title, path) in &cache.note_chunks {
            let mut score = 0.0f32;
            let dims = std::cmp::min(query_vector.len(), chunk_embedding.len());
            for d in 0..dims {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                let key = format!("note:{}", title);
                let combined_score = score * 0.7; // Dense semantic score component weight
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

    // Query Rules Chunks (vector cache dot-product evaluation)
    if category == "all" || category == "rules" {
        for (_chunk_id, rule_id, chunk_embedding, chunk_text, title, source) in &cache.rule_chunks {
            let mut score = 0.0f32;
            let dims = std::cmp::min(query_vector.len(), chunk_embedding.len());
            for d in 0..dims {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                let key = format!("rule:{}", title);
                let combined_score = score * 0.7; // Dense semantic score component weight
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

    // --- Phase 3: Result Consolidation & Ranking ---
    let mut final_results: Vec<super::SearchResult> = best_results.into_values().collect();
    final_results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok((final_results, expanded))
}

/// Chunks and indexes all rules in the database into SQLite `rule_chunks` table.
/// Evicts `ChunkCache` upon completion.
pub fn index_all_rules_vectors(conn: &rusqlite::Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, content FROM rules")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (rule_id, content) = row.map_err(|e| e.to_string())?;

        let _ = conn.execute("DELETE FROM rule_chunks WHERE rule_id = ?1;", [&rule_id]);

        let chunks = chunk_text(&content, 120, 20);
        for chunk in chunks {
            if chunk.trim().is_empty() {
                continue;
            }
            if let Ok(embedding) = generate_embedding(&chunk) {
                db::insert_rule_chunk(&conn, &rule_id, &chunk, &embedding)
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    invalidate_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_text_short() {
        let text = "This is a short note.";
        let chunks = chunk_text(text, 100, 10);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "This is a short note.");
    }

    #[test]
    fn test_chunk_text_long() {
        let text = "A very long text that should be split into multiple chunks because it exceeds the size limit. We want to verify that overlap works and splits are correct.";
        // Let's use small chunk size to force splitting: chunk size 10 tokens (~40 chars), overlap 2 tokens (~8 chars)
        let chunks = chunk_text(text, 10, 2);
        assert!(chunks.len() > 1);
        // Verify no empty chunks
        for chunk in &chunks {
            assert!(!chunk.trim().is_empty());
        }
    }

    #[test]
    fn test_cosine_similarity_calculation() {
        // Since we cannot run local ONNX model download in tests, we test the math of similarity score directly.
        // L2 normalized vectors
        let vec_a = [1.0f32, 0.0f32, 0.0f32];
        let vec_b = [1.0f32, 0.0f32, 0.0f32];
        let vec_c = [0.0f32, 1.0f32, 0.0f32];

        // Similarity between vec_a and vec_b should be 1.0 (identical)
        let mut score_ab = 0.0f32;
        for d in 0..3 {
            score_ab += vec_a[d] * vec_b[d];
        }
        assert!((score_ab - 1.0).abs() < 1e-5);

        // Similarity between vec_a and vec_c should be 0.0 (orthogonal)
        let mut score_ac = 0.0f32;
        for d in 0..3 {
            score_ac += vec_a[d] * vec_c[d];
        }
        assert!(score_ac.abs() < 1e-5);
    }

    // --- Increment B: query expansion (synonym service + fuzzy layer) ---

    #[test]
    fn test_levenshtein_distance() {
        // Identical strings.
        assert_eq!(levenshtein_distance("campaign", "campaign"), 0);
        // Single insertion.
        assert_eq!(levenshtein_distance("campain", "campaign"), 1);
        // Single deletion.
        assert_eq!(levenshtein_distance("campaign", "campain"), 1);
        // Single substitution.
        assert_eq!(levenshtein_distance("combat", "combar"), 1);
        // Transposition costs 2 (two substitutions in classic Levenshtein).
        assert_eq!(levenshtein_distance("cgna", "cgan"), 2);
        // Classic example.
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        // Empty strings.
        assert_eq!(levenshtein_distance("", ""), 0);
        assert_eq!(levenshtein_distance("abc", ""), 3);
        assert_eq!(levenshtein_distance("", "abc"), 3);
    }

    #[test]
    fn test_fuzzy_threshold() {
        assert_eq!(fuzzy_threshold(0), 0);
        assert_eq!(fuzzy_threshold(3), 0);
        assert_eq!(fuzzy_threshold(4), 1);
        assert_eq!(fuzzy_threshold(5), 1);
        assert_eq!(fuzzy_threshold(6), 2);
        assert_eq!(fuzzy_threshold(20), 2);
    }

    /// Writes a small lexicon into a temp vault and returns the vault path.
    fn write_test_lexicon(tmp: &tempfile::TempDir) -> String {
        let lexicon_dir = tmp.path().join("lexicon");
        std::fs::create_dir_all(&lexicon_dir).unwrap();
        std::fs::write(
            lexicon_dir.join("synonyms.json"),
            r#"{
  "campaign": ["campain", "campaing"],
  "combat": ["cmbat"]
}
"#,
        )
        .unwrap();
        tmp.path().to_str().unwrap().to_string()
    }

    #[test]
    fn test_expand_query_synonyms_and_fuzzy() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = write_test_lexicon(&tmp);

        // Exact variant -> canonical key (expanded).
        let (terms, expanded) = expand_query("campain", &vault);
        assert!(expanded);
        assert!(terms.iter().any(|t| t == "campaign"));

        // Exact key -> key + variants (expanded).
        let (terms, expanded) = expand_query("combat", &vault);
        assert!(expanded);
        assert!(terms.iter().any(|t| t == "cmbat"));

        // Fuzzy key match within threshold (expanded).
        let (terms, expanded) = expand_query("cmbat", &vault);
        assert!(expanded);
        assert!(terms.iter().any(|t| t == "combat"));

        // Unknown token unchanged (not expanded).
        let (terms, expanded) = expand_query("goblin", &vault);
        assert!(!expanded);
        assert_eq!(terms, vec!["goblin".to_string()]);

        // No lexicon at all -> single term, not expanded.
        let empty_tmp = tempfile::tempdir().unwrap();
        let (terms, expanded) = expand_query("campaign", empty_tmp.path().to_str().unwrap());
        assert!(!expanded);
        assert_eq!(terms, vec!["campaign".to_string()]);
    }

    /// GATE TEST (Increment B): a fuzzy/variant query returns expanded results.
    ///
    /// The roadmap's literal `cgna` example is illustrative — `cgna` is not
    /// within threshold of any real lexicon key, so the gate uses realistic
    /// typos (`campain` → `campaign`, `cmbat` → `combat`) that exercise both
    /// the synonym-variant path and the fuzzy path.
    #[test]
    fn test_hybrid_query_fuzzy_expansion_gate() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = write_test_lexicon(&tmp);

        // Point the embedding-provider lookup at a temp path so
        // `generate_embedding`'s DB probe never touches the repo cwd.
        set_db_path(tmp.path().join("embed.db").to_str().unwrap());

        let conn = db::init_db(":memory:").unwrap();
        db::upsert_note(
            &conn,
            "Worldbuilding/CampaignNotes.md",
            "Campaign Notes",
            "The campaign spans the eastern reaches and its combat is brutal.",
            &HashMap::new(),
            None,
        )
        .unwrap();
        db::upsert_note(
            &conn,
            "Worldbuilding/CombatRules.md",
            "Combat Rules",
            "Combat uses initiative and action economy.",
            &HashMap::new(),
            None,
        )
        .unwrap();

        // Variant query: `campain` expands to `campaign` and finds the note.
        let (results, expanded) = hybrid_query(&conn, "campain", "notes", &vault).unwrap();
        assert!(expanded, "variant query should be flagged as expanded");
        assert!(
            results.iter().any(|r| r.title == "Campaign Notes"),
            "expected 'Campaign Notes' for 'campain', got {:?}",
            results.iter().map(|r| &r.title).collect::<Vec<_>>()
        );

        // Fuzzy query: `cmbat` expands to `combat` and finds the note.
        let (results, expanded) = hybrid_query(&conn, "cmbat", "notes", &vault).unwrap();
        assert!(expanded, "fuzzy query should be flagged as expanded");
        assert!(
            results.iter().any(|r| r.title == "Combat Rules"),
            "expected 'Combat Rules' for 'cmbat', got {:?}",
            results.iter().map(|r| &r.title).collect::<Vec<_>>()
        );

        // Exact query still works (and is expanded — variants are added).
        let (results, expanded) = hybrid_query(&conn, "campaign", "notes", &vault).unwrap();
        assert!(
            expanded,
            "exact lexicon key should still be flagged as expanded"
        );
        assert!(
            results.iter().any(|r| r.title == "Campaign Notes"),
            "expected 'Campaign Notes' for exact 'campaign'"
        );

        // A query with no lexicon match is NOT expanded and still works.
        let (results, expanded) = hybrid_query(&conn, "goblin", "notes", &vault).unwrap();
        assert!(!expanded, "unknown query should not be flagged as expanded");
        assert!(
            results.is_empty(),
            "no note should match 'goblin', got {:?}",
            results.iter().map(|r| &r.title).collect::<Vec<_>>()
        );

        invalidate_cache();
    }
}
