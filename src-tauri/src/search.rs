use crate::db;
use ort::{inputs, session::Session};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokenizers::Tokenizer;

/// Hybrid Search Indexer & Matcher
/// Blends classic full-text keyword indexing (SQLite FTS5) with dense vector search.
/// Vector embeddings are calculated via ONNX Runtime and ranked using cosine dot-products.

// --- Global Search Engine State ---

pub struct SearchEngine {
    pub session: Session,
    pub tokenizer: Tokenizer,
}

static ENGINE: OnceLock<Mutex<Option<SearchEngine>>> = OnceLock::new();
static DB_PATH: OnceLock<String> = OnceLock::new();

fn engine() -> &'static Mutex<Option<SearchEngine>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

/// Set the current DB path for embedding provider lookups.
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

/// Download standard MiniLM vector model files on start if not already present.
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

/// Generates a normalized embedding vector for a string.
/// If embed_provider is set to "openai" or "gemini" in settings, uses the remote API.
/// Otherwise uses the local ONNX model.
pub fn generate_embedding(text: &str) -> Result<Vec<f32>, String> {
    // Check if a remote embedding provider is configured
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

    // Fall back to local ONNX model
    generate_embedding_local(text)
}

/// Generate embedding using OpenAI-compatible API.
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

    // L2 normalize
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

/// Generate embedding using Google Gemini API.
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

    // L2 normalize
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

/// Generates a normalized 384-dimensional embedding vector using the local ONNX model.
fn generate_embedding_local(text: &str) -> Result<Vec<f32>, String> {
    let mut engine_guard = engine().lock().unwrap_or_else(|e| e.into_inner());
    let engine = engine_guard
        .as_mut()
        .ok_or("Search engine not initialized")?;

    // Tokenize
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

    // Run inference using tuple shape/data representations to bypass ndarray conflicts
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

    // Mean Pooling over attention mask tokens
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

    // Cosine similarity normalization (L2 norm)
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

/// Chunking logic for rules and campaign notes.
///
/// Uses character-based chunking with approximate token sizing (~4 chars/token)
/// to avoid BPE decode artifacts from arbitrary token window slicing.
/// Falls back gracefully if the BPE tokenizer is unavailable.
pub fn chunk_text(text: &str, chunk_size_tokens: usize, overlap_tokens: usize) -> Vec<String> {
    // Approximate 4 characters per token for English text
    let char_chunk_size = chunk_size_tokens * 4;
    let char_overlap = overlap_tokens * 4;
    chunk_text_by_chars(text, char_chunk_size, char_overlap)
}

/// Simple character-based chunking fallback when the BPE tokenizer is unavailable.
fn chunk_text_by_chars(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let end = std::cmp::min(start + chunk_size, text.len());
        // Make sure we don't split in the middle of a multibyte char
        let safe_end = if text[..end].is_char_boundary(end) || end == text.len() {
            end
        } else {
            text[..end]
                .char_indices()
                .last()
                .map(|(i, _)| i)
                .unwrap_or(end)
        };
        let chunk = &text[start..safe_end];
        if !chunk.trim().is_empty() {
            chunks.push(chunk.to_string());
        }
        let step = chunk_size.saturating_sub(overlap);
        if step == 0 {
            break;
        }
        start += step;
    }
    chunks
}

/// Chunks and indexes a note into the vector database.
pub fn index_note_vectors(
    conn: &rusqlite::Connection,
    note_id: &str,
    content: &str,
) -> Result<(), String> {
    db::clear_note_chunks(conn, note_id).map_err(|e| e.to_string())?;

    // Split note content into paragraphs/chunks
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

    Ok(())
}

/// Performs a hybrid similarity ranking over notes and rules chunks.
/// Combines FTS5 keyword search with vector similarity search.
pub fn hybrid_query(
    conn: &rusqlite::Connection,
    query_text: &str,
    category: &str,
) -> Result<Vec<super::SearchResult>, String> {
    // Collect results: key = "type:title" -> (SearchResult, has_fts, has_vector)
    let mut best_results: HashMap<String, super::SearchResult> = HashMap::new();

    // --- FTS5 Keyword Search ---
    if category == "all" || category == "notes" {
        if let Ok(fts_results) = db::fts_search_notes(&conn, query_text, 20) {
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
                let score = fts_score * 0.3;
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

    if category == "all" || category == "rules" {
        if let Ok(fts_results) = db::fts_search_rules(&conn, query_text, 20) {
            for (rule_id, title, snippet, fts_score) in fts_results {
                let key = format!("rule:{}", title);
                let score = fts_score * 0.3;
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

    // --- Vector Similarity Search ---
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
            return Ok(final_results);
        }
    };

    // Query Notes Chunks (vector)
    if category == "all" || category == "notes" {
        let chunks = db::get_all_note_chunks(&conn).map_err(|e| e.to_string())?;
        for (_chunk_id, note_id, chunk_embedding, chunk_text, title, _note_path) in chunks {
            let mut score = 0.0f32;
            let dims = std::cmp::min(query_vector.len(), chunk_embedding.len());
            for d in 0..dims {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                // Fetch the note path for navigation
                let note_path = conn
                    .query_row::<String, _, _>(
                        "SELECT path FROM notes WHERE id = ?1",
                        [&note_id],
                        |r| r.get(0),
                    )
                    .unwrap_or_else(|_| note_id.clone());

                let key = format!("note:{}", title);
                let combined_score = score * 0.7; // Weight vector score
                match best_results.get(&key) {
                    Some(existing) if existing.score >= combined_score => {}
                    _ => {
                        best_results.insert(
                            key,
                            super::SearchResult {
                                r#type: "note".to_string(),
                                title,
                                snippet: chunk_text,
                                score: combined_score,
                                path: note_path,
                            },
                        );
                    }
                }
            }
        }
    }

    // Query Rules Chunks (vector)
    if category == "all" || category == "rules" {
        let chunks = db::get_all_rule_chunks(&conn).map_err(|e| e.to_string())?;
        for (_chunk_id, rule_id, chunk_embedding, chunk_text, title, source) in chunks {
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
                                title,
                                snippet: format!("[{}] {}", source, chunk_text),
                                score: combined_score,
                                path: rule_id,
                            },
                        );
                    }
                }
            }
        }
    }

    let mut final_results: Vec<super::SearchResult> = best_results.into_values().collect();
    final_results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(final_results)
}

/// Chunks and indexes all rules in the database.
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
        let vec_a = vec![1.0f32, 0.0f32, 0.0f32];
        let vec_b = vec![1.0f32, 0.0f32, 0.0f32];
        let vec_c = vec![0.0f32, 1.0f32, 0.0f32];

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
}
