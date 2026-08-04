//! HLOOKUP 在横向表上的通配符语义。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

/// Build a horizontal fruit table for HLOOKUP wildcard tests.
fn make_hwildcard_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let cols: [(&str, f64); 5] = [
        ("apple", 1.0),
        ("BANANA", 2.0),
        ("blueberry", 3.0),
        ("a*", 4.0),
        ("cherry", 5.0),
    ];
    for (i, (name, n)) in cols.iter().enumerate() {
        let col = i as u32;
        let k = AtomId::from_raw((col * 2) as u64);
        let v = AtomId::from_raw((col * 2 + 1) as u64);
        cm.insert(CellAddress::new(0, col), k);
        cm.insert(CellAddress::new(1, col), v);
        vs.insert(k, Value::Text((*name).into()));
        vs.insert(v, Value::Number(*n));
    }
    (cm, vs)
}

#[test]
fn eval_hlookup_wildcard_exact_mode() {
    let (cm, vs) = make_hwildcard_env();
    // "b*" → BANANA (col 2) → 2.
    assert_eq!(
        eval_str("=HLOOKUP(\"b*\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(2.0)
    );
    // "?pple" → apple → 1.
    assert_eq!(
        eval_str("=HLOOKUP(\"?pple\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(1.0)
    );
    // "*berry" → blueberry → 3.
    assert_eq!(
        eval_str("=HLOOKUP(\"*berry\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(3.0)
    );
    // Case-insensitive wildcard: lowercase pattern matches uppercase BANANA.
    assert_eq!(
        eval_str("=HLOOKUP(\"banana*\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(2.0)
    );
    // Escape: "a~*" matches literal "a*" → 4.
    assert_eq!(
        eval_str("=HLOOKUP(\"a~*\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(4.0)
    );
}

#[test]
fn eval_hlookup_no_wildcards_in_approximate_mode() {
    // Regression: approximate mode treats "z*" as a literal text key.
    let (cm, vs) = make_hwildcard_env();
    assert!(matches!(
        eval_str("=HLOOKUP(\"z*\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
    assert!(matches!(
        eval_str("=HLOOKUP(\"z*\",A1:E2,2,TRUE)", &cm, &vs),
        Value::Number(_)
    ));
}

#[test]
fn eval_hlookup_plain_text_regression() {
    let (cm, vs) = make_hwildcard_env();
    // Plain non-wildcard text uses values_equal.
    assert_eq!(
        eval_str("=HLOOKUP(\"cherry\",A1:E2,2,FALSE)", &cm, &vs),
        Value::Number(5.0)
    );
}
