//! Backend dice roller for the Architect's `roll_dice` tool.
//!
//! Mirrors the frontend `fallbackRoll` in `src/utils/dice.ts` so the tool
//! result matches what the user sees in the scratchpad.

/// Rolls dice from standard RPG notation (e.g. `2d6+1`, `1d20`, `3d6+1d4`).
///
/// Returns a human-readable explanation string, or an error message for
/// invalid notation.
pub fn roll(notation: &str) -> String {
    let str = notation.to_lowercase().replace(char::is_whitespace, "");
    let term_regex = regex::Regex::new(r"([+-]?)(?:(\d*)d(\d+|%|f)|(\d+))").unwrap();

    let mut total: i64 = 0;
    let mut explanation: Vec<String> = Vec::new();

    for cap in term_regex.captures_iter(&str) {
        let sign = if cap.get(1).map(|m| m.as_str() == "-").unwrap_or(false) {
            -1
        } else {
            1
        };
        let sign_text = cap
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| {
                if explanation.is_empty() {
                    String::new()
                } else {
                    "+".to_string()
                }
            });

        if let Some(plain) = cap.get(4) {
            let val: i64 = plain.as_str().parse().unwrap_or(0);
            total += sign * val;
            explanation.push(format!("{}{}", sign_text, val));
        } else {
            let count: i64 = cap
                .get(2)
                .map(|m| m.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.parse().unwrap_or(1))
                .unwrap_or(1);
            let sides_str = cap.get(3).map(|m| m.as_str()).unwrap_or("6");
            let term_rolls: Vec<i64> = (0..count)
                .map(|_| match sides_str {
                    "%" => rand_range(1, 100),
                    "f" => rand_range(0, 2) - 1,
                    _ => {
                        let sides: i64 = sides_str.parse().unwrap_or(6);
                        rand_range(1, sides)
                    }
                })
                .collect();
            let term_total: i64 = term_rolls.iter().sum();
            total += sign * term_total;
            explanation.push(format!(
                "{}{}d{}[{}]",
                sign_text,
                count,
                sides_str,
                term_rolls
                    .iter()
                    .map(|r| r.to_string())
                    .collect::<Vec<_>>()
                    .join(",")
            ));
        }
    }

    if explanation.is_empty() {
        return format!("Invalid notation: {}", notation);
    }
    format!("{}: {} = {}", notation, explanation.join(" "), total)
}

/// Uniform random integer in `[min, max]` inclusive.
fn rand_range(min: i64, max: i64) -> i64 {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    rng.gen_range(min..=max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_modifier() {
        let out = roll("5");
        assert!(out.starts_with("5: 5 = 5"), "got: {}", out);
    }

    #[test]
    fn test_single_die() {
        let out = roll("1d20");
        assert!(out.starts_with("1d20: 1d20["), "got: {}", out);
        assert!(out.ends_with(" = 1") || out.contains(" = "), "got: {}", out);
    }

    #[test]
    fn test_sum_with_modifier() {
        let out = roll("2d6+3");
        assert!(out.starts_with("2d6+3: "), "got: {}", out);
        assert!(out.contains("+3"), "got: {}", out);
    }

    #[test]
    fn test_invalid_notation() {
        let out = roll("hello");
        assert!(out.starts_with("Invalid notation"), "got: {}", out);
    }
}
