//! XLOOKUP 的匹配模式与搜索模式。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_xlookup() {
    let (cm, vs) = make_test_env();
    // Build a synthetic lookup table on row 4: A4=1 B4=2 C4=3
    // return values on row 5: A5="one" B5="two" C5="three"
    // We can't easily inject extra cells without rebuilding the env,
    // so use existing A1:C1 = 10,20,0 and A2:B2 = 5,"text".
    // XLOOKUP(20, A1:C1, A2:C2) — 20 is in A1:C1 at position 2 → returns
    // A2:C2 position 2 = "text" (which is B2).
    assert_eq!(
        eval_str("=XLOOKUP(20,A1:C1,A2:C2)", &cm, &vs),
        Value::Text("text".into())
    );
    // Exact match for 10 → A2's value (5).
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:C2)", &cm, &vs),
        Value::Number(5.0)
    );
    // Not found without default → #N/A.
    assert_eq!(
        eval_str("=XLOOKUP(999,A1:C1,A2:C2)", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
    // Not found with default → the default.
    assert_eq!(
        eval_str("=XLOOKUP(999,A1:C1,A2:C2,\"nope\")", &cm, &vs),
        Value::Text("nope".into())
    );
    // Shape mismatch: A1:C1 (3 cells) vs A2:B2 (2 cells) → InvalidValue.
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:B2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count (< 3).
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // match_mode=1 (exact-or-larger) with an exact match present
    // returns the exact hit (10 → A2=5).
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:C2,\"x\",1)", &cm, &vs),
        Value::Number(5.0)
    );
    // search_mode=-1 (reverse) with an exact match also finds 10 → A2=5.
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:C2,\"x\",0,-1)", &cm, &vs),
        Value::Number(5.0)
    );
    // match_mode=99 → InvalidValue.
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:C2,\"x\",99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // search_mode=99 → InvalidValue.
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:C1,A2:C2,\"x\",0,99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

/// Build a numeric env where row 1 is the lookup array and row 2 is the
/// return array. Caller supplies the (lookup, return) pairs as a flat list
/// indexed left-to-right starting at column A.
fn make_xlookup_env(
    pairs: &[(Value, Value)],
) -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (i, (lookup, ret)) in pairs.iter().enumerate() {
        let col = i as u32;
        let l_atom = AtomId::from_raw((col * 2) as u64);
        let r_atom = AtomId::from_raw((col * 2 + 1) as u64);
        cm.insert(CellAddress::new(0, col), l_atom);
        cm.insert(CellAddress::new(1, col), r_atom);
        vs.insert(l_atom, lookup.clone());
        vs.insert(r_atom, ret.clone());
    }
    (cm, vs)
}

#[test]
fn eval_xlookup_approximate_smaller() {
    // lookup_array [10, 20, 30] with return "a"/"b"/"c". needle=25,
    // match_mode=-1 → exact-or-next-smaller → 20 → "b".
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(10.0), Value::Text("a".into())),
        (Value::Number(20.0), Value::Text("b".into())),
        (Value::Number(30.0), Value::Text("c".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(25,A1:C1,A2:C2,\"none\",-1)", &cm, &vs),
        Value::Text("b".into())
    );
    // Below the smallest key → no candidate → fallback.
    assert_eq!(
        eval_str("=XLOOKUP(5,A1:C1,A2:C2,\"none\",-1)", &cm, &vs),
        Value::Text("none".into())
    );
}

#[test]
fn eval_xlookup_approximate_larger() {
    // Same array, needle=25, match_mode=1 → exact-or-next-larger → 30 → "c".
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(10.0), Value::Text("a".into())),
        (Value::Number(20.0), Value::Text("b".into())),
        (Value::Number(30.0), Value::Text("c".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(25,A1:C1,A2:C2,\"none\",1)", &cm, &vs),
        Value::Text("c".into())
    );
    // Above the largest key → no candidate → fallback.
    assert_eq!(
        eval_str("=XLOOKUP(99,A1:C1,A2:C2,\"none\",1)", &cm, &vs),
        Value::Text("none".into())
    );
}

#[test]
fn eval_xlookup_wildcard() {
    // lookup_array ["apple","banana","cherry"], needle="b*",
    // match_mode=2 → matches "banana" → return at index 1 = 20.
    let (cm, vs) = make_xlookup_env(&[
        (Value::Text("apple".into()), Value::Number(10.0)),
        (Value::Text("banana".into()), Value::Number(20.0)),
        (Value::Text("cherry".into()), Value::Number(30.0)),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(\"b*\",A1:C1,A2:C2,\"none\",2)", &cm, &vs),
        Value::Number(20.0)
    );
    // Plain text (no wildcards) also works through wildcard mode.
    assert_eq!(
        eval_str("=XLOOKUP(\"cherry\",A1:C1,A2:C2,\"none\",2)", &cm, &vs),
        Value::Number(30.0)
    );
    // No match → fallback.
    assert_eq!(
        eval_str("=XLOOKUP(\"z*\",A1:C1,A2:C2,\"none\",2)", &cm, &vs),
        Value::Text("none".into())
    );
}

#[test]
fn eval_xlookup_wildcard_lookup_not_text() {
    // Wildcard mode requires a Text needle; passing a number → #TYPE!.
    let (cm, vs) = make_xlookup_env(&[
        (Value::Text("apple".into()), Value::Number(10.0)),
        (Value::Text("banana".into()), Value::Number(20.0)),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(42,A1:B1,A2:B2,\"none\",2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_xlookup_reverse_search() {
    // lookup_array [1,2,3,2,1] with return ["a","b","c","d","e"]. Needle
    // 2 in reverse → matches the LATER 2 at index 3 → "d", not "b".
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(1.0), Value::Text("a".into())),
        (Value::Number(2.0), Value::Text("b".into())),
        (Value::Number(3.0), Value::Text("c".into())),
        (Value::Number(2.0), Value::Text("d".into())),
        (Value::Number(1.0), Value::Text("e".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(2,A1:E1,A2:E2,\"none\",0,-1)", &cm, &vs),
        Value::Text("d".into())
    );
    // Sanity: forward search returns the first match → "b".
    assert_eq!(
        eval_str("=XLOOKUP(2,A1:E1,A2:E2,\"none\",0,1)", &cm, &vs),
        Value::Text("b".into())
    );
}

#[test]
fn eval_xlookup_binary_ascending() {
    // Sorted ascending: [1,5,10,20,40] → return "a".."e". Needle 10 with
    // search_mode=2 (binary asc) and exact match → "c".
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(1.0), Value::Text("a".into())),
        (Value::Number(5.0), Value::Text("b".into())),
        (Value::Number(10.0), Value::Text("c".into())),
        (Value::Number(20.0), Value::Text("d".into())),
        (Value::Number(40.0), Value::Text("e".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:E1,A2:E2,\"none\",0,2)", &cm, &vs),
        Value::Text("c".into())
    );
    // No exact match + exact mode → fallback.
    assert_eq!(
        eval_str("=XLOOKUP(7,A1:E1,A2:E2,\"none\",0,2)", &cm, &vs),
        Value::Text("none".into())
    );
    // Binary search combined with approximate (next smaller): needle=7
    // → 5 → "b".
    assert_eq!(
        eval_str("=XLOOKUP(7,A1:E1,A2:E2,\"none\",-1,2)", &cm, &vs),
        Value::Text("b".into())
    );
    // Binary search combined with approximate (next larger): needle=7
    // → 10 → "c".
    assert_eq!(
        eval_str("=XLOOKUP(7,A1:E1,A2:E2,\"none\",1,2)", &cm, &vs),
        Value::Text("c".into())
    );
}

#[test]
fn eval_xlookup_binary_descending() {
    // Sorted descending: [40,20,10,5,1] → return "a".."e". Needle 10 with
    // search_mode=-2 (binary desc) and exact match → "c".
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(40.0), Value::Text("a".into())),
        (Value::Number(20.0), Value::Text("b".into())),
        (Value::Number(10.0), Value::Text("c".into())),
        (Value::Number(5.0), Value::Text("d".into())),
        (Value::Number(1.0), Value::Text("e".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(10,A1:E1,A2:E2,\"none\",0,-2)", &cm, &vs),
        Value::Text("c".into())
    );
    // Binary desc + approximate next smaller: needle=7 → 5 → "d".
    assert_eq!(
        eval_str("=XLOOKUP(7,A1:E1,A2:E2,\"none\",-1,-2)", &cm, &vs),
        Value::Text("d".into())
    );
    // Binary desc + approximate next larger: needle=7 → 10 → "c".
    assert_eq!(
        eval_str("=XLOOKUP(7,A1:E1,A2:E2,\"none\",1,-2)", &cm, &vs),
        Value::Text("c".into())
    );
    // Above the largest key (40) with next-larger → fallback.
    assert_eq!(
        eval_str("=XLOOKUP(99,A1:E1,A2:E2,\"none\",1,-2)", &cm, &vs),
        Value::Text("none".into())
    );
}

#[test]
fn eval_xlookup_invalid_match_mode() {
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(1.0), Value::Text("a".into())),
        (Value::Number(2.0), Value::Text("b".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(1,A1:B1,A2:B2,\"none\",99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_xlookup_invalid_search_mode() {
    let (cm, vs) = make_xlookup_env(&[
        (Value::Number(1.0), Value::Text("a".into())),
        (Value::Number(2.0), Value::Text("b".into())),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(1,A1:B1,A2:B2,\"none\",0,99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_xlookup_wildcard_with_binary_rejected() {
    // Wildcard (match_mode=2) cannot be combined with binary search
    // (search_mode=±2) because wildcards have no ordering. → InvalidValue.
    let (cm, vs) = make_xlookup_env(&[
        (Value::Text("apple".into()), Value::Number(10.0)),
        (Value::Text("banana".into()), Value::Number(20.0)),
    ]);
    assert_eq!(
        eval_str("=XLOOKUP(\"b*\",A1:B1,A2:B2,\"none\",2,2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=XLOOKUP(\"b*\",A1:B1,A2:B2,\"none\",2,-2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
