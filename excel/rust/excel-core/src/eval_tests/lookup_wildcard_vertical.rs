//! MATCH/VLOOKUP 在纵向表上的通配符语义。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::lookup_env::*;

/// Build a small fruit table for wildcard tests.
/// A1:B5 = (apple,1) (BANANA,2) (blueberry,3) ("a*",4 literal) (cherry,5)
fn make_wildcard_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let rows: [(&str, f64); 5] = [
        ("apple", 1.0),
        ("BANANA", 2.0),
        ("blueberry", 3.0),
        ("a*", 4.0), // literal star, exercises `~*` escape
        ("cherry", 5.0),
    ];
    for (i, (name, n)) in rows.iter().enumerate() {
        let row = i as u32;
        let k = AtomId::from_raw((row * 2) as u64);
        let v = AtomId::from_raw((row * 2 + 1) as u64);
        cm.insert(CellAddress::new(row, 0), k);
        cm.insert(CellAddress::new(row, 1), v);
        vs.insert(k, Value::Text((*name).into()));
        vs.insert(v, Value::Number(*n));
    }
    (cm, vs)
}

#[test]
fn eval_match_wildcard_exact_mode() {
    let (cm, vs) = make_wildcard_env();
    // `*` at end: "b*" → "BANANA" first (case-insensitive) → position 2.
    assert_eq!(
        eval_str("=MATCH(\"b*\",A1:A5,0)", &cm, &vs),
        Value::Number(2.0)
    );
    // `*` at start: "*berry" → "blueberry" → position 3.
    assert_eq!(
        eval_str("=MATCH(\"*berry\",A1:A5,0)", &cm, &vs),
        Value::Number(3.0)
    );
    // `*` in middle: "a*e" → "apple" → 1.
    assert_eq!(
        eval_str("=MATCH(\"a*e\",A1:A5,0)", &cm, &vs),
        Value::Number(1.0)
    );
    // `?` single-char wildcard: "?pple" → "apple" → 1.
    assert_eq!(
        eval_str("=MATCH(\"?pple\",A1:A5,0)", &cm, &vs),
        Value::Number(1.0)
    );
    // Case-insensitive: upper-case pattern hits "BANANA".
    assert_eq!(
        eval_str("=MATCH(\"B*\",A1:A5,0)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn eval_match_wildcard_escaped_star_matches_literal() {
    let (cm, vs) = make_wildcard_env();
    // "~*" escapes the wildcard. Pattern "a~*" should match the literal
    // text "a*" at row 4, NOT "apple" (which would match the bare "a*").
    assert_eq!(
        eval_str("=MATCH(\"a~*\",A1:A5,0)", &cm, &vs),
        Value::Number(4.0)
    );
}

#[test]
fn eval_match_no_wildcard_regression() {
    let (cm, vs) = make_wildcard_env();
    // Plain text needle (no `?`/`*`/`~`) → standard exact equality.
    assert_eq!(
        eval_str("=MATCH(\"apple\",A1:A5,0)", &cm, &vs),
        Value::Number(1.0)
    );
    // No match → #N/A.
    assert!(matches!(
        eval_str("=MATCH(\"nope\",A1:A5,0)", &cm, &vs),
        Value::Error(_)
    ));
}

#[test]
fn eval_match_wildcard_only_in_exact_mode() {
    let (cm, vs) = make_wildcard_env();
    // Regression: match_type=1 must NOT treat "a*" as a pattern. The
    // existing arm treats type=1 as exact equality (legacy behavior),
    // so "a*" matches the literal entry at row 4 (NOT "apple" which
    // would be the wildcard interpretation).
    assert_eq!(
        eval_str("=MATCH(\"a*\",A1:A5,1)", &cm, &vs),
        Value::Number(4.0)
    );
    // Same with match_type=-1.
    assert_eq!(
        eval_str("=MATCH(\"a*\",A1:A5,-1)", &cm, &vs),
        Value::Number(4.0)
    );
    // And a pattern with no literal counterpart: with type=1, "b*" is
    // literal, no row "b*" exists → #N/A.
    assert!(matches!(
        eval_str("=MATCH(\"b*\",A1:A5,1)", &cm, &vs),
        Value::Error(_)
    ));
}

#[test]
fn eval_match_non_text_needle_no_wildcard() {
    // Numbers don't trigger wildcard interpretation.
    let (cm, vs) = make_lookup_env();
    assert_eq!(eval_str("=MATCH(2,A1:A3,0)", &cm, &vs), Value::Number(2.0));
}

#[test]
fn eval_match_coerces_numbers_for_wildcard_text_needle() {
    // Numeric cells are coerced to text before the wildcard test, so
    // pattern "4?" matches a numeric 42.
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let a2 = AtomId::from_raw(1);
    let a3 = AtomId::from_raw(2);
    cm.insert(CellAddress::new(0, 0), a1);
    cm.insert(CellAddress::new(1, 0), a2);
    cm.insert(CellAddress::new(2, 0), a3);
    vs.insert(a1, Value::Number(3.0));
    vs.insert(a2, Value::Number(42.0));
    vs.insert(a3, Value::Number(50.0));
    assert_eq!(
        eval_str("=MATCH(\"4?\",A1:A3,0)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn eval_vlookup_wildcard_exact_mode() {
    let (cm, vs) = make_wildcard_env();
    // "b*" exact → first row with text matching "b*" is BANANA → 2.
    assert_eq!(
        eval_str("=VLOOKUP(\"b*\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(2.0)
    );
    // "*berry" → blueberry → 3.
    assert_eq!(
        eval_str("=VLOOKUP(\"*berry\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(3.0)
    );
    // "?pple" → apple → 1.
    assert_eq!(
        eval_str("=VLOOKUP(\"?pple\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(1.0)
    );
    // Case-insensitive wildcard: lowercase pattern matches uppercase BANANA.
    // (Needle must contain a wildcard to trigger case-insensitivity;
    // bare-text lookup uses values_equal which is case-sensitive.)
    assert_eq!(
        eval_str("=VLOOKUP(\"banana*\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn eval_vlookup_escaped_wildcard() {
    let (cm, vs) = make_wildcard_env();
    // "a~*" → literal "a*" at row 4 → return col 2 = 4.
    assert_eq!(
        eval_str("=VLOOKUP(\"a~*\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(4.0)
    );
}

#[test]
fn eval_vlookup_no_wildcards_in_approximate_mode() {
    // Regression: range_lookup=TRUE must NOT interpret patterns.
    let (cm, vs) = make_wildcard_env();
    // Exact mode with "z*" yields #N/A (no text starts with z).
    assert!(matches!(
        eval_str("=VLOOKUP(\"z*\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
    // Approximate mode with "z*" returns a value (the literal "z*"
    // compares > all text keys, so the "largest <= needle" rule
    // picks the last enumerated key). The key invariant: it is NOT
    // an error — proving the wildcard path was not taken.
    assert!(matches!(
        eval_str("=VLOOKUP(\"z*\",A1:B5,2,TRUE)", &cm, &vs),
        Value::Number(_)
    ));
}

#[test]
fn eval_vlookup_no_wildcard_text_regression() {
    let (cm, vs) = make_wildcard_env();
    // Plain text needle (no special chars) uses values_equal.
    assert_eq!(
        eval_str("=VLOOKUP(\"cherry\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Number(5.0)
    );
    assert!(matches!(
        eval_str("=VLOOKUP(\"nope\",A1:B5,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
}

#[test]
fn eval_vlookup_non_text_needle_no_wildcard() {
    // Numeric needle never engages wildcard logic.
    let (cm, vs) = make_lookup_env();
    assert_eq!(
        eval_str("=VLOOKUP(2,A1:B3,2,FALSE)", &cm, &vs),
        Value::Number(20.0)
    );
}

#[test]
fn eval_match_error_needle_propagates() {
    let (cm, vs) = make_wildcard_env();
    // 1/0 evaluates to #DIV/0!, which must propagate through MATCH.
    assert!(matches!(
        eval_str("=MATCH(1/0,A1:A5,0)", &cm, &vs),
        Value::Error(_)
    ));
}

#[test]
fn eval_vlookup_error_needle_propagates() {
    let (cm, vs) = make_wildcard_env();
    assert!(matches!(
        eval_str("=VLOOKUP(1/0,A1:B5,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
}
