//! # Expression Engine (`expr.rs`)
//!
//! A SMALL, safe expression evaluator for dice + arithmetic + comparisons.
//!
//! Supports:
//!   - Dice notation: `3d6`, `1d20+2`, `2d6+1d4`, `d%`, `dF` (Fudge)
//!   - Arithmetic: `+ - * /` with parentheses and unary minus
//!   - `max(a,b)`, `min(a,b)` functions
//!   - Comparisons: `> < >= <= == !=` (evaluate to 1 or 0)
//!
//! ## Safety
//! - Hand-rolled recursive-descent parser. NO `exprtk`, no external eval.
//! - It computes numbers and nothing else: no filesystem, no network, no
//!   plugin access, no `std::process`, no `unsafe`.
//! - Malformed input returns a clean `Err` — it can never be tricked into
//!   anything but a number.
//! - Division by zero and overflow are guarded.
//!
//! ## Design
//! Mirrors the style of Increment B's hand-rolled levenshtein: a small,
//! well-tested parser with no heavy dependency. `rand` is already a dep
//! (used by `dice.rs`).

use rand::Rng;

/// Evaluate an expression string, returning the numeric result.
///
/// Dice are rolled fresh on each call. For a deterministic result (tests),
/// use [`evaluate_with_rng`].
pub fn evaluate(expr: &str) -> Result<i64, String> {
    let mut rng = rand::thread_rng();
    evaluate_with_rng(expr, &mut rng)
}

/// Evaluate with an injected RNG (for tests and reproducibility).
pub fn evaluate_with_rng<R: Rng + ?Sized>(expr: &str, rng: &mut R) -> Result<i64, String> {
    let mut parser = Parser::new(expr, rng);
    let value = parser.parse_expression()?;
    parser.expect_end()?;
    Ok(value)
}

/// A single dice roll result, for the `/roll` affordance to display.
pub struct RollResult {
    /// The expression as written.
    pub expression: String,
    /// Per-die rolls, e.g. `["3", "5", "1"]` for `3d6`.
    pub rolls: Vec<i64>,
    /// The summed total.
    pub total: i64,
}

/// Roll dice notation only (`3d6+2`), returning a structured result.
///
/// This is the `/roll` affordance path: it parses the expression, collects
/// the individual die rolls, and returns the total. Non-dice arithmetic is
/// still evaluated, but only dice contribute to `rolls`.
pub fn roll(expr: &str) -> Result<RollResult, String> {
    let mut rng = rand::thread_rng();
    roll_with_rng(expr, &mut rng)
}

/// Roll with an injected RNG (for tests).
pub fn roll_with_rng<R: Rng + ?Sized>(expr: &str, rng: &mut R) -> Result<RollResult, String> {
    let mut parser = Parser::new(expr, rng);
    let value = parser.parse_expression()?;
    parser.expect_end()?;
    Ok(RollResult {
        expression: expr.to_string(),
        rolls: parser.rolls,
        total: value,
    })
}

// --- Parser ---

struct Parser<'a, R: ?Sized> {
    chars: Vec<char>,
    pos: usize,
    rng: &'a mut R,
    rolls: Vec<i64>,
}

impl<'a, R: Rng + ?Sized> Parser<'a, R> {
    fn new(expr: &str, rng: &'a mut R) -> Self {
        // Strip whitespace; keep everything else for the parser to validate.
        let chars: Vec<char> = expr.chars().filter(|c| !c.is_whitespace()).collect();
        Parser {
            chars,
            pos: 0,
            rng,
            rolls: Vec::new(),
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn next(&mut self) -> Option<char> {
        let c = self.chars.get(self.pos).copied();
        if c.is_some() {
            self.pos += 1;
        }
        c
    }

    fn expect_end(&self) -> Result<(), String> {
        if self.pos == self.chars.len() {
            Ok(())
        } else {
            Err(format!(
                "Unexpected character '{}' at position {}",
                self.chars[self.pos], self.pos
            ))
        }
    }

    // expression := comparison
    fn parse_expression(&mut self) -> Result<i64, String> {
        self.parse_comparison()
    }

    // comparison := additive (('>'|'<'|'>='|'<='|'=='|'!=') additive)*
    fn parse_comparison(&mut self) -> Result<i64, String> {
        let mut left = self.parse_additive()?;
        loop {
            let op = match self.peek() {
                Some('>') | Some('<') | Some('=') | Some('!') => self.next().unwrap(),
                _ => break,
            };
            // Handle two-char operators.
            let op2 = self.peek();
            let op = match (op, op2) {
                ('>', Some('=')) => {
                    self.next();
                    ">="
                }
                ('<', Some('=')) => {
                    self.next();
                    "<="
                }
                ('=', Some('=')) => {
                    self.next();
                    "=="
                }
                ('!', Some('=')) => {
                    self.next();
                    "!="
                }
                ('>', _) => ">",
                ('<', _) => "<",
                ('=', _) => "==",
                ('!', _) => "!=",
                (c, _) => return Err(format!("Unknown comparison operator '{}'", c)),
            };
            let right = self.parse_additive()?;
            left = match op {
                ">" => (left > right) as i64,
                "<" => (left < right) as i64,
                ">=" => (left >= right) as i64,
                "<=" => (left <= right) as i64,
                "==" => (left == right) as i64,
                "!=" => (left != right) as i64,
                _ => return Err(format!("Unknown comparison operator '{}'", op)),
            };
        }
        Ok(left)
    }

    // additive := multiplicative (('+'|'-') multiplicative)*
    fn parse_additive(&mut self) -> Result<i64, String> {
        let mut value = self.parse_multiplicative()?;
        loop {
            match self.peek() {
                Some('+') => {
                    self.next();
                    let rhs = self.parse_multiplicative()?;
                    value = value.checked_add(rhs).ok_or("Integer overflow")?;
                }
                Some('-') => {
                    self.next();
                    let rhs = self.parse_multiplicative()?;
                    value = value.checked_sub(rhs).ok_or("Integer overflow")?;
                }
                _ => break,
            }
        }
        Ok(value)
    }

    // multiplicative := unary (('*'|'/') unary)*
    fn parse_multiplicative(&mut self) -> Result<i64, String> {
        let mut value = self.parse_unary()?;
        loop {
            match self.peek() {
                Some('*') => {
                    self.next();
                    let rhs = self.parse_unary()?;
                    value = value.checked_mul(rhs).ok_or("Integer overflow")?;
                }
                Some('/') => {
                    self.next();
                    let rhs = self.parse_unary()?;
                    if rhs == 0 {
                        return Err("Division by zero".to_string());
                    }
                    value = value.checked_div(rhs).ok_or("Integer overflow")?;
                }
                _ => break,
            }
        }
        Ok(value)
    }

    // unary := ('-'|'+') unary | primary
    fn parse_unary(&mut self) -> Result<i64, String> {
        match self.peek() {
            Some('-') => {
                self.next();
                let v = self.parse_unary()?;
                v.checked_neg()
                    .ok_or_else(|| "Integer overflow".to_string())
            }
            Some('+') => {
                self.next();
                self.parse_unary()
            }
            _ => self.parse_primary(),
        }
    }

    // primary := number | dice | function | '(' expression ')'
    fn parse_primary(&mut self) -> Result<i64, String> {
        match self.peek() {
            Some('(') => {
                self.next();
                let v = self.parse_expression()?;
                match self.next() {
                    Some(')') => Ok(v),
                    _ => Err("Expected ')'".to_string()),
                }
            }
            Some(c) if c.is_ascii_digit() => self.parse_number_or_dice(),
            Some(c) if c.is_ascii_alphabetic() => self.parse_function_or_dice(),
            Some(c) => Err(format!("Unexpected character '{}'", c)),
            None => Err("Unexpected end of expression".to_string()),
        }
    }

    // A leading digit could be a plain number or a dice count (e.g. `3d6`).
    fn parse_number_or_dice(&mut self) -> Result<i64, String> {
        let num = self.parse_digits()?;
        if self.peek() == Some('d') {
            self.next();
            let sides = self.parse_dice_sides()?;
            self.roll_dice(num, sides)
        } else {
            Ok(num)
        }
    }

    // A leading letter is a function (max/min) or a bare die (d6, d%, dF).
    fn parse_function_or_dice(&mut self) -> Result<i64, String> {
        let name = self.parse_ident();
        match name.as_str() {
            "max" | "min" => {
                if self.next() != Some('(') {
                    return Err(format!("Expected '(' after '{}'", name));
                }
                let a = self.parse_expression()?;
                if self.next() != Some(',') {
                    return Err("Expected ',' in function call".to_string());
                }
                let b = self.parse_expression()?;
                if self.next() != Some(')') {
                    return Err("Expected ')' in function call".to_string());
                }
                Ok(if name == "max" { a.max(b) } else { a.min(b) })
            }
            "d" => {
                // Bare die: `d6`, `d%`, `dF`.
                let sides = self.parse_dice_sides()?;
                self.roll_dice(1, sides)
            }
            _ => Err(format!("Unknown function '{}'", name)),
        }
    }

    fn parse_digits(&mut self) -> Result<i64, String> {
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                s.push(c);
                self.next();
            } else {
                break;
            }
        }
        if s.is_empty() {
            Err("Expected a number".to_string())
        } else {
            s.parse::<i64>().map_err(|_| "Number too large".to_string())
        }
    }

    fn parse_ident(&mut self) -> String {
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if c.is_ascii_alphabetic() {
                s.push(c);
                self.next();
            } else {
                break;
            }
        }
        s
    }

    // After 'd': a number, '%' (percentile), or 'F' (Fudge).
    fn parse_dice_sides(&mut self) -> Result<i64, String> {
        match self.peek() {
            Some('%') => {
                self.next();
                Ok(100)
            }
            Some('F') | Some('f') => {
                self.next();
                Ok(-1) // sentinel for Fudge
            }
            _ => self.parse_digits(),
        }
    }

    fn roll_dice(&mut self, count: i64, sides: i64) -> Result<i64, String> {
        if count <= 0 {
            return Err("Dice count must be positive".to_string());
        }
        if count > 1000 {
            return Err("Too many dice (max 1000)".to_string());
        }
        let mut total: i64 = 0;
        for _ in 0..count {
            let roll = if sides == -1 {
                // Fudge die: -1, 0, +1.
                self.rng.gen_range(-1..=1)
            } else if sides == 100 {
                self.rng.gen_range(1..=100)
            } else if sides >= 1 {
                self.rng.gen_range(1..=sides)
            } else {
                return Err("Invalid die sides".to_string());
            };
            self.rolls.push(roll);
            total = total.checked_add(roll).ok_or("Integer overflow")?;
        }
        Ok(total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    fn eval(expr: &str) -> Result<i64, String> {
        let mut rng = StdRng::seed_from_u64(42);
        evaluate_with_rng(expr, &mut rng)
    }

    #[test]
    fn plain_arithmetic() {
        assert_eq!(eval("2+3").unwrap(), 5);
        assert_eq!(eval("10-4").unwrap(), 6);
        assert_eq!(eval("3*4").unwrap(), 12);
        assert_eq!(eval("20/5").unwrap(), 4);
        assert_eq!(eval("2+3*4").unwrap(), 14); // precedence
        assert_eq!(eval("(2+3)*4").unwrap(), 20); // parens
        assert_eq!(eval("-5+10").unwrap(), 5); // unary minus
        assert_eq!(eval("+7").unwrap(), 7); // unary plus
    }

    #[test]
    fn comparisons() {
        assert_eq!(eval("3>2").unwrap(), 1);
        assert_eq!(eval("2>3").unwrap(), 0);
        assert_eq!(eval("3>=3").unwrap(), 1);
        assert_eq!(eval("3<2").unwrap(), 0);
        assert_eq!(eval("2<=2").unwrap(), 1);
        assert_eq!(eval("3==3").unwrap(), 1);
        assert_eq!(eval("3!=4").unwrap(), 1);
        assert_eq!(eval("1+1==2").unwrap(), 1);
    }

    #[test]
    fn max_min() {
        assert_eq!(eval("max(3,7)").unwrap(), 7);
        assert_eq!(eval("min(3,7)").unwrap(), 3);
        assert_eq!(eval("max(1+1, 5)").unwrap(), 5);
    }

    #[test]
    fn dice_rolls_in_range() {
        // 1000d1 always sums to 1000.
        assert_eq!(eval("1000d1").unwrap(), 1000);
        // 1d1 is always 1.
        assert_eq!(eval("1d1").unwrap(), 1);
        // 1d100 is within [1,100].
        let v = eval("1d100").unwrap();
        assert!((1..=100).contains(&v), "got {}", v);
    }

    #[test]
    fn dice_with_modifier() {
        // 1d1+5 is always 6.
        assert_eq!(eval("1d1+5").unwrap(), 6);
        // 2d1*3 is always 6.
        assert_eq!(eval("2d1*3").unwrap(), 6);
    }

    #[test]
    fn roll_collects_die_values() {
        let mut rng = StdRng::seed_from_u64(7);
        let res = roll_with_rng("3d1+2", &mut rng).unwrap();
        assert_eq!(res.rolls, vec![1, 1, 1]);
        assert_eq!(res.total, 5);
    }

    #[test]
    fn malformed_input_is_clean_error() {
        assert!(eval("").is_err());
        assert!(eval("2+").is_err());
        assert!(eval("(2+3").is_err());
        assert!(eval("2+3)").is_err());
        assert!(eval("hello").is_err());
        assert!(eval("1/0").is_err());
        assert!(eval("max(1)").is_err());
        assert!(eval("0d6").is_err());
        assert!(eval("99999999999999999999").is_err());
    }

    #[test]
    fn cannot_escape_to_side_effects() {
        // The parser only ever produces numbers; these all error cleanly.
        assert!(eval("std::process::exit(0)").is_err());
        assert!(eval("import os").is_err());
        assert!(eval("`rm -rf /`").is_err());
    }
}
