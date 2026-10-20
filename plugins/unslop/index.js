/**
 * Loreweaver Plugin: Campaign Prose Humaniser (Unslop)
 * 
 * Powered by MohamedAbdallah-14/unslop concepts.
 * Strips AI-isms, sycophancy, stock clichés, and em-dash pileups from campaign notes
 * and generated TTRPG descriptions while preserving code, markdown formatting, wiki-links,
 * and dice tags.
 * 
 * Runs synchronously in the embedded Boa JavaScript engine.
 */

// Replacement rules: [Pattern Regex, Replacement String, Rule Name]
var UNSLOP_RULES = [
    // Hedging and filler stacks
    [/\b(it is|it's)\s+important\s+to\s+note\s+that\b\s*/gi, "", "hedging-important-to-note"],
    [/\b(it is|it's)\s+worth\s+mentioning\s+that\b\s*/gi, "", "hedging-worth-mentioning"],
    [/\bit\s+should\s+be\s+noted\s+that\b\s*/gi, "", "hedging-should-be-noted"],
    [/\bgenerally\s+speaking,\s*/gi, "", "hedging-generally-speaking"],
    [/\bat\s+its\s+core,\s*/gi, "", "authority-at-its-core"],
    [/\bfundamentally,\s*/gi, "", "authority-fundamentally"],
    
    // Sycophancy & conversational filler
    [/^(certainly|absolutely|sure)[!.,]\s*/gim, "", "sycophancy-starter"],
    [/^i'd\s+be\s+happy\s+to\s+help[!.,]?\s*/gim, "", "sycophancy-happy-to-help"],
    [/^great\s+question[!.,]\s*/gim, "", "sycophancy-great-question"],
    [/^(here\s+is|here's)\s+a\s+(detailed\s+)?(breakdown|overview)\s+of\s*/gim, "", "signposting-breakdown"],

    // Canonical AI stock vocabulary & metaphors
    [/\ba\s+testament\s+to\b/gi, "evidence of", "vocab-testament"],
    [/\brich\s+tapestry\s+of\b/gi, "intricate history of", "vocab-tapestry"],
    [/\btapestry\s+of\b/gi, "blend of", "vocab-tapestry-single"],
    [/\bdelve\s+into\b/gi, "explore", "vocab-delve"],
    [/\bdelving\s+into\b/gi, "exploring", "vocab-delving"],
    [/\bdelves\s+into\b/gi, "explores", "vocab-delves"],
    [/\bdelved\s+into\b/gi, "explored", "vocab-delved"],
    [/\bembark\s+on\s+a\s+journey\b/gi, "set out", "vocab-embark-journey"],
    [/\bembarks?\s+on\b/gi, "begins", "vocab-embark"],
    [/\bin\s+the\s+realm\s+of\b/gi, "within", "vocab-realm"],
    [/\bvast\s+landscape\s+of\b/gi, "expanse of", "vocab-landscape"],
    [/\bdynamic\s+landscape\b/gi, "shifting environment", "vocab-dynamic-landscape"],
    [/\bnestled\s+in\s+the\s+heart\s+of\b/gi, "situated in", "vocab-nestled-heart"],
    [/\bnestled\s+(among|between|in)\b/gi, "located $1", "vocab-nestled"],
    [/\bbeacon\s+of\s+hope\b/gi, "rallying point", "vocab-beacon-of-hope"],
    [/\bcutting-edge\b/gi, "advanced", "vocab-cutting-edge"],
    [/\bstate-of-the-art\b/gi, "modern", "vocab-state-of-the-art"],
    [/\bseamlessly\b/gi, "smoothly", "vocab-seamlessly"],
    [/\bseamless\b/gi, "fluid", "vocab-seamless"],
    [/\bholistic\b/gi, "complete", "vocab-holistic"],
    [/\bleverage\b/gi, "use", "vocab-leverage"],
    [/\bparamount\b/gi, "vital", "vocab-paramount"],
    [/\bpivotal\s+role\b/gi, "central role", "vocab-pivotal-role"],
    [/\bpivotal\b/gi, "vital", "vocab-pivotal"],
    [/\bintricate\s+interplay\b/gi, "interaction", "vocab-interplay"],
    [/\binterplay\s+of\b/gi, "interaction of", "vocab-interplay-of"],
    [/\bever-evolving\b/gi, "changing", "vocab-ever-evolving"]
];

/**
 * Protects sensitive markdown structures (fenced code, inline code, wiki-links, dice)
 * with placeholder tokens before applying regex passes.
 */
function protect_structures(text) {
    var protectedTokens = [];
    var tokenIndex = 0;

    function addToken(match) {
        var placeholder = "___PROTECTED_UNSLOP_" + (tokenIndex++) + "___";
        protectedTokens.push({ placeholder: placeholder, original: match });
        return placeholder;
    }

    // 1. Frontmatter
    text = text.replace(/^---[\s\S]*?---\n?/m, addToken);

    // 2. Fenced code blocks
    text = text.replace(/```[\s\S]*?```/g, addToken);

    // 3. Inline code
    text = text.replace(/`[^`\n]+`/g, addToken);

    // 4. Wiki-links ([[Target]] or [[Target|Alias]])
    text = text.replace(/\[\[[\s\S]*?\]\]/g, addToken);

    // 5. Dice formulas and callouts ([1d20+4], etc.)
    text = text.replace(/\[\d+d\d+[+-]?\d*\]/gi, addToken);

    // 6. Markdown URLs ([Label](url))
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, addToken);

    return { text: text, tokens: protectedTokens };
}

/**
 * Restores protected structures from placeholders.
 */
function restore_structures(text, tokens) {
    for (var i = 0; i < tokens.length; i++) {
        text = text.replace(tokens[i].placeholder, tokens[i].original);
    }
    return text;
}

/**
 * Normalises excessive em-dashes. AI prose often stacks multiple em-dashes per sentence.
 */
function clean_em_dashes(text) {
    var paragraphs = text.split("\n\n");
    for (var p = 0; p < paragraphs.length; p++) {
        var para = paragraphs[p];
        // Count em-dashes
        var matches = para.match(/—/g);
        if (matches && matches.length > 2) {
            // Replace surplus em-dashes with commas or semicolons
            var dashCount = 0;
            paragraphs[p] = para.replace(/—/g, function() {
                dashCount++;
                if (dashCount > 2) {
                    return (dashCount % 2 === 1) ? ", " : " - ";
                }
                return "—";
            });
        }
    }
    return paragraphs.join("\n\n");
}

/**
 * Main de-slopping function.
 */
function unslop_text(rawText) {
    if (!rawText || typeof rawText !== "string") {
        return { cleaned_text: "", replacements_count: 0, replaced: [] };
    }

    var originalLength = rawText.length;
    var protectedData = protect_structures(rawText);
    var processed = protectedData.text;
    var replacedRules = [];
    var totalReplacements = 0;

    for (var i = 0; i < UNSLOP_RULES.length; i++) {
        var pattern = UNSLOP_RULES[i][0];
        var replacement = UNSLOP_RULES[i][1];
        var ruleName = UNSLOP_RULES[i][2];

        var matchCount = (processed.match(pattern) || []).length;
        if (matchCount > 0) {
            processed = processed.replace(pattern, replacement);
            replacedRules.push(ruleName + " (" + matchCount + ")");
            totalReplacements += matchCount;
        }
    }

    // Normalise em-dash pileups
    processed = clean_em_dashes(processed);

    // Clean up double spaces created by deletions
    processed = processed.replace(/[ \t]{2,}/g, " ");

    var restored = restore_structures(processed, protectedData.tokens);

    return {
        cleaned_text: restored,
        original_length: originalLength,
        cleaned_length: restored.length,
        replacements_count: totalReplacements,
        replaced: replacedRules
    };
}

/**
 * Hook: humanize_prose
 * Payload can be a raw string or JSON: { "text": "...", "mode": "balanced" }
 */
function humanize_prose(payload) {
    var text = "";
    var mode = "balanced";

    try {
        var parsed = JSON.parse(payload);
        if (typeof parsed === "string") {
            text = parsed;
        } else if (parsed && typeof parsed.text === "string") {
            text = parsed.text;
            if (parsed.mode) mode = parsed.mode;
        } else {
            text = String(payload || "");
        }
    } catch (e) {
        text = String(payload || "");
    }

    var result = unslop_text(text);

    // Update persistent state in globalThis.__state
    if (typeof __state === "object" && __state !== null) {
        __state.total_cleaned = (__state.total_cleaned || 0) + 1;
        __state.total_replacements = (__state.total_replacements || 0) + result.replacements_count;
    }

    return JSON.stringify(result);
}

/**
 * Hook: clean_note
 * Payload: JSON { "title": "...", "content": "..." }
 */
function clean_note(payload) {
    var data = {};
    try {
        data = JSON.parse(payload);
    } catch (e) {
        data = { content: String(payload || "") };
    }

    var content = data.content || "";
    var result = unslop_text(content);

    if (typeof __state === "object" && __state !== null) {
        __state.total_cleaned = (__state.total_cleaned || 0) + 1;
        __state.total_replacements = (__state.total_replacements || 0) + result.replacements_count;
    }

    var summary = result.replacements_count > 0
        ? "Humanised note: stripped " + result.replacements_count + " AI-isms (" + result.replaced.join(", ") + ")."
        : "Prose was already clean; no AI-isms detected.";

    return JSON.stringify({
        title: data.title || "Untitled",
        content: result.cleaned_text,
        replacements_count: result.replacements_count,
        summary: summary
    });
}

/**
 * Hook: get_stats
 */
function get_stats(payload) {
    var stats = {
        total_cleaned: (__state && __state.total_cleaned) || 0,
        total_replacements: (__state && __state.total_replacements) || 0
    };
    return JSON.stringify(stats);
}
