//! # Web Clipping (`webclip.rs`)
//!
//! Fetches a URL over HTTP, extracts the main readable content, and converts it
//! to clean Markdown. The app pulls the page itself (rather than relying on a
//! third-party readability service), so clipping works offline-ish and keeps the
//! user's browsing private.
//!
//! ## Pipeline
//! 1. Fetch the page with `ureq` (blocking, 30s timeout, redirects, browser-ish UA).
//! 2. Extract the `<title>` for the clip title and the hostname for the site.
//! 3. Extract the main readable content (`<article>` / `<main>` / body fallback)
//!    using `scraper`.
//! 4. Convert the extracted HTML to Markdown with `html2md`.
//! 5. Return a `WebClip` with provenance metadata.

use crate::WebClip;

/// Browser-ish User-Agent so sites don't reject the request as a bot.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Validates a URL for clipping: must parse and use http/https.
///
/// Extracted from `clip_url` so the non-network error paths are unit-testable
/// without hitting the network.
fn validate_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https URLs can be clipped".to_string());
    }
    Ok(parsed)
}

/// Fetches `url`, extracts the main readable content, and converts it to Markdown.
///
/// Returns a `WebClip` on success, or a human-readable error string on failure.
pub fn clip_url(url: &str) -> Result<WebClip, String> {
    let parsed = validate_url(url)?;

    // Build a configured agent: 30s timeout, follow up to 5 redirects, browser-ish UA.
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(30))
        .redirects(5)
        .user_agent(USER_AGENT)
        .build();

    let response = agent
        .get(url)
        .call()
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    let status = response.status();
    if !(200..300).contains(&status) {
        return Err(format!("URL returned HTTP status {}", status));
    }

    let html = response
        .into_string()
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // Extract title and site.
    let title = extract_title(&html).unwrap_or_else(|| parsed.to_string());
    let site = parsed
        .host_str()
        .unwrap_or("")
        .to_string();

    // Extract main readable content and convert to Markdown.
    let main_html = extract_main_content(&html);
    let markdown = html2md::parse_html(&main_html);

    Ok(WebClip {
        title,
        site,
        url: url.to_string(),
        markdown,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Extracts the `<title>` element text from an HTML document.
fn extract_title(html: &str) -> Option<String> {
    let document = scraper::Html::parse_document(html);
    let selector = scraper::Selector::parse("title").ok()?;
    document
        .select(&selector)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_string())
}

/// Extracts the main readable content from an HTML document.
///
/// Prefers `<article>`, then `<main>`, then `<body>` as a fallback. This keeps
/// navigation, sidebars, and footers out of the clipped Markdown.
fn extract_main_content(html: &str) -> String {
    let document = scraper::Html::parse_document(html);

    for selector_str in ["article", "main", "body"] {
        if let Ok(selector) = scraper::Selector::parse(selector_str) {
            if let Some(el) = document.select(&selector).next() {
                return el.html();
            }
        }
    }

    // Fallback: return the whole document.
    html.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_url_accepts_http() {
        let parsed = validate_url("http://example.com/page").unwrap();
        assert_eq!(parsed.scheme(), "http");
    }

    #[test]
    fn validate_url_accepts_https() {
        let parsed = validate_url("https://example.com/page?q=1").unwrap();
        assert_eq!(parsed.scheme(), "https");
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        let err = validate_url("ftp://example.com/file").unwrap_err();
        assert!(err.contains("Only http and https"));
    }

    #[test]
    fn validate_url_rejects_malformed_urls() {
        let err = validate_url("not a url at all").unwrap_err();
        assert!(err.contains("Invalid URL"));
    }

    #[test]
    fn validate_url_rejects_empty_string() {
        let err = validate_url("").unwrap_err();
        assert!(err.contains("Invalid URL"));
    }

    #[test]
    fn extract_title_returns_title_text() {
        let html = "<html><head><title>My Page</title></head><body><p>hi</p></body></html>";
        assert_eq!(extract_title(html).as_deref(), Some("My Page"));
    }

    #[test]
    fn extract_title_returns_none_without_title_tag() {
        let html = "<html><body><p>no title here</p></body></html>";
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn extract_main_content_prefers_article() {
        let html = "<html><body><nav>menu</nav><article><p>the good stuff</p></article></body></html>";
        let main = extract_main_content(html);
        assert!(main.contains("the good stuff"));
        assert!(!main.contains("menu"));
    }

    #[test]
    fn extract_main_content_falls_back_to_body() {
        let html = "<html><body><p>only body content</p></body></html>";
        let main = extract_main_content(html);
        assert!(main.contains("only body content"));
    }
}
