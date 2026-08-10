//! Local PDF → Markdown conversion via the `pdf-inspector` crate.
//!
//! Runs fully on-device (no cloud, no OCR). Detects scanned/image-based PDFs
//! and returns a clear error instead of producing empty output.

use pdf_inspector::{PdfError, PdfType};

/// Converts PDF bytes to Markdown, or returns an error if the PDF is
/// scanned/image-based (needs OCR) or otherwise unprocessable.
pub fn pdf_bytes_to_markdown(bytes: &[u8]) -> Result<String, String> {
    let result = pdf_inspector::process_pdf_mem(bytes).map_err(|e| match e {
        PdfError::Encrypted => "PDF is encrypted".to_string(),
        PdfError::NotAPdf(_) => "Not a valid PDF".to_string(),
        PdfError::Parse(msg) => format!("Parse error: {msg}"),
        PdfError::InvalidStructure => "Malformed PDF structure".to_string(),
        PdfError::Io(e) => format!("IO error: {e}"),
    })?;

    // Scanned / image-based => no usable text layer => needs OCR.
    if matches!(result.pdf_type, PdfType::Scanned | PdfType::ImageBased) {
        return Err(format!(
            "PDF is scanned/image-based ({} pages need OCR)",
            result.pages_needing_ocr.len()
        ));
    }

    // Garbled text layer => treat as needing OCR too.
    if result.has_encoding_issues {
        return Err("PDF text layer is garbled (encoding issues); needs OCR".to_string());
    }

    result
        .markdown
        .ok_or_else(|| "No markdown produced".to_string())
}
