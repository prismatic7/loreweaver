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

/// Fetches `url`, extracts the main readable content, and converts it to Markdown.
///
/// Returns a `WebClip` on success, or a human-readable error string on failure.
pub fn clip_url(url: &str) -> Result<WebClip, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https URLs can be clipped".to_string());
    }

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
