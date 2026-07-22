use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use ort::{inputs, session::Session};
use tiktoken_rs::cl100k_base;
use tokenizers::Tokenizer;
use crate::db;

// --- Global Search Engine State ---

pub struct SearchEngine {
    pub session: Session,
    pub tokenizer: Tokenizer,
}

static ENGINE: OnceLock<Mutex<Option<SearchEngine>>> = OnceLock::new();

fn engine() -> &'static Mutex<Option<SearchEngine>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

/// Download standard MiniLM vector model files on start if not already present.
pub fn init_search_engine(app_data_path: &str) -> Result<(), String> {
    // Check if dynamic libraries for ONNX need initialization
    #[cfg(target_os = "macos")]
    {
        // ort init is automatic in v2, but we can call it to be sure
        let _ = ort::init();
    }

    let model_dir = PathBuf::from(app_data_path).join("models").join("all-MiniLM-L6-v2");
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

    let mut engine_guard = engine().lock().unwrap();
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

/// Generates a normalized 384-dimensional embedding vector for a string.
pub fn generate_embedding(text: &str) -> Result<Vec<f32>, String> {
    let mut engine_guard = engine().lock().unwrap();
    let engine = engine_guard.as_mut().ok_or("Search engine not initialized")?;

    // Tokenize
    let encoding = engine.tokenizer.encode(text, true)
        .map_err(|e| format!("Tokenization failed: {:?}", e))?;

    let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
    let attention_mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&mask| mask as i64).collect();
    let token_type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&id| id as i64).collect();

    let seq_len = input_ids.len();

    // Run inference using tuple shape/data representations to bypass ndarray conflicts
    let outputs = engine.session.run(inputs![
        "input_ids" => ort::value::Tensor::from_array((vec![1usize, seq_len], input_ids)).map_err(|e| e.to_string())?,
        "attention_mask" => ort::value::Tensor::from_array((vec![1usize, seq_len], attention_mask.clone())).map_err(|e| e.to_string())?,
        "token_type_ids" => ort::value::Tensor::from_array((vec![1usize, seq_len], token_type_ids)).map_err(|e| e.to_string())?,
    ])
    .map_err(|e| format!("ONNX model execution failed: {:?}", e))?;

    let output_tensor = outputs.get("last_hidden_state")
        .ok_or("Failed to extract last_hidden_state from ONNX model outputs")?;
    let (_shape, data) = output_tensor.try_extract_tensor::<f32>()
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

/// Token-aware overlapping chunking logic for rules and campaign notes.
///
/// Uses the cl100k_base tokenizer (used by GPT-4 / text-embedding-3) to respect
/// real token boundaries instead of whitespace word counts. This produces chunks
/// that fit the embedding model's context window more predictably.
pub fn chunk_text(text: &str, chunk_size_tokens: usize, overlap_tokens: usize) -> Vec<String> {
    let bpe = cl100k_base().map_err(|e| format!("Failed to load tokenizer: {}", e)).unwrap();
    let tokens = bpe.encode_with_special_tokens(text);

    if tokens.len() <= chunk_size_tokens {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < tokens.len() {
        let end = std::cmp::min(start + chunk_size_tokens, tokens.len());
        let token_window = &tokens[start..end];
        let chunk = bpe.decode(token_window).unwrap_or_default();
        if !chunk.trim().is_empty() {
            chunks.push(chunk);
        }

        let step = chunk_size_tokens.saturating_sub(overlap_tokens);
        if step == 0 {
            break;
        }
        start += step;
    }

    chunks
}

/// Chunks and indexes a note into the vector database.
pub fn index_note_vectors(db_path: &str, note_id: &str, content: &str) -> Result<(), String> {
    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
    db::clear_note_chunks(&conn, note_id).map_err(|e| e.to_string())?;

    // Split note content into paragraphs/chunks
    let chunks = chunk_text(content, 120, 20);

    for chunk in chunks {
        if chunk.trim().is_empty() {
            continue;
        }
        
        // Generate embedding (will skip if search engine is not ready, e.g. on fallback)
        match generate_embedding(&chunk) {
            Ok(embedding) => {
                db::insert_note_chunk(&conn, note_id, &chunk, &embedding).map_err(|e| e.to_string())?;
            }
            Err(e) => {
                eprintln!("Failed to generate vector embedding: {:?}. Storing chunk text only.", e);
                // In case model is not yet loaded, write chunk with 0 vector as fallback
                let empty_emb = vec![0.0f32; 384];
                db::insert_note_chunk(&conn, note_id, &chunk, &empty_emb).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

/// Performs a hybrid similarity ranking over notes and rules chunks.
pub fn hybrid_query(
    db_path: &str,
    query_text: &str,
    category: &str,
) -> Result<Vec<super::SearchResult>, String> {
    let query_vector = match generate_embedding(query_text) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Could not embed query: {:?}. Falling back to basic keyword keyword scoring.", e);
            return fallback_keyword_search(db_path, query_text, category);
        }
    };

    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    // Query Notes Chunks
    if category == "all" || category == "notes" {
        let chunks = db::get_all_note_chunks(&conn).map_err(|e| e.to_string())?;
        for (_chunk_id, note_id, chunk_embedding, chunk_text, title) in chunks {
            // Since vectors are normalized, Cosine Similarity is just the Dot Product!
            let mut score = 0.0f32;
            for d in 0..384 {
                score += query_vector[d] * chunk_embedding[d];
            }

            // Only keep results with reasonable similarity
            if score > 0.4 {
                results.push(super::SearchResult {
                    r#type: "note".to_string(),
                    title,
                    snippet: chunk_text,
                    score,
                    path: note_id, // Reference to note ID
                });
            }
        }
    }

    // Query Rules Chunks
    if category == "all" || category == "rules" {
        let chunks = db::get_all_rule_chunks(&conn).map_err(|e| e.to_string())?;
        for (_chunk_id, _rule_id, chunk_embedding, chunk_text, title, source) in chunks {
            let mut score = 0.0f32;
            for d in 0..384 {
                score += query_vector[d] * chunk_embedding[d];
            }

            if score > 0.4 {
                results.push(super::SearchResult {
                    r#type: "rule".to_string(),
                    title,
                    snippet: format!("[{}] {}", source, chunk_text),
                    score,
                    path: source,
                });
            }
        }
    }

    // Deduplicate and group results by note/rule to return the highest scoring chunk per note
    let mut best_results: HashMap<String, super::SearchResult> = HashMap::new();
    for res in results {
        let key = format!("{}:{}", res.r#type, res.title);
        match best_results.get(&key) {
            Some(existing) if existing.score >= res.score => {}
            _ => {
                best_results.insert(key, res);
            }
        }
    }

    let mut final_results: Vec<super::SearchResult> = best_results.into_values().collect();
    final_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    
    Ok(final_results)
}

fn fallback_keyword_search(
    db_path: &str,
    query: &str,
    category: &str,
) -> Result<Vec<super::SearchResult>, String> {
    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    if category == "all" || category == "notes" {
        let notes = db::load_all_notes(&conn).map_err(|e| e.to_string())?;
        for note in notes {
            if note.title.to_lowercase().contains(&query_lower) || note.content.to_lowercase().contains(&query_lower) {
                results.push(super::SearchResult {
                    r#type: "note".to_string(),
                    title: note.title,
                    snippet: note.content.chars().take(150).collect(),
                    score: 0.5,
                    path: note.id,
                });
            }
        }
    }

    Ok(results)
}

/// Chunks and indexes all rules in the database.
pub fn index_all_rules_vectors(db_path: &str) -> Result<(), String> {
    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, content FROM rules").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (rule_id, content) = row.map_err(|e| e.to_string())?;
        
        let _ = conn.execute("DELETE FROM rule_chunks WHERE rule_id = ?1;", [&rule_id]);

        let chunks = chunk_text(&content, 120, 20);
        for chunk in chunks {
            if chunk.trim().is_empty() {
                continue;
            }
            if let Ok(embedding) = generate_embedding(&chunk) {
                db::insert_rule_chunk(&conn, &rule_id, &chunk, &embedding).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

