//! Stable comparison of native cell values.

use std::cmp::Ordering;

use einfach_core::Value;

use super::{SortDirection, SortKey};

/// Rank of the Excel type classes in ascending order. `Lambda` folds into
/// the error class (transient evaluator state; never durably in cells).
fn type_rank(v: &Value) -> u8 {
    match v {
        Value::Number(_) => 0,
        Value::Text(_) => 1,
        Value::Boolean(_) => 2,
        Value::Error(_) | Value::Lambda(_) => 3,
        Value::Null => 4,
        // Unreachable for sort keys (the spill gate rejects in-range
        // arrays and callers collapse); ranked defensively via key_scalar.
        Value::Array(_) => 0,
    }
}

/// Collapse a `Value::Array` to its top-left scalar. Sort keys can never
/// be arrays after the spill gate, but the comparator stays total anyway
/// (mirrors the WASM boundary collapse).
fn key_scalar(v: &Value) -> &Value {
    match v {
        Value::Array(arr) => arr.get(0, 0).unwrap_or(&Value::Null),
        other => other,
    }
}

/// NaN is an engineering extension (Excel has no NaN): NaNs compare equal
/// to each other and sort after every real number within the number class.
fn cmp_number(a: f64, b: f64) -> Ordering {
    match (a.is_nan(), b.is_nan()) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => a.partial_cmp(&b).unwrap_or(Ordering::Equal),
    }
}

/// Text order: code-point order, case-folded via the std Unicode lowercase
/// mapping when `case_sensitive` is false. Deliberately no locale
/// collation (design §3.2 conformance note — determinism over ICU).
fn cmp_text(a: &str, b: &str, case_sensitive: bool) -> Ordering {
    if case_sensitive {
        a.chars().cmp(b.chars())
    } else {
        a.chars()
            .flat_map(char::to_lowercase)
            .cmp(b.chars().flat_map(char::to_lowercase))
    }
}

/// Comparison within the non-empty classes; callers have already peeled
/// the empty layer and collapsed arrays.
fn cmp_non_null(a: &Value, b: &Value, case_sensitive: bool) -> Ordering {
    let (ra, rb) = (type_rank(a), type_rank(b));
    if ra != rb {
        return ra.cmp(&rb);
    }
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => cmp_number(*x, *y),
        (Value::Text(x), Value::Text(y)) => cmp_text(x, y, case_sensitive),
        (Value::Boolean(x), Value::Boolean(y)) => x.cmp(y),
        // Error class (incl. Lambda): errors never compare against each
        // other — stability preserves their pre-sort slot order.
        _ => Ordering::Equal,
    }
}

/// Normative ascending total order (design §3.2): number < text < boolean
/// < error < empty, with empty always last. Stable sorting on top of this
/// order gives the full sort semantics.
pub fn sort_cmp(a: &Value, b: &Value, case_sensitive: bool) -> Ordering {
    let (a, b) = (key_scalar(a), key_scalar(b));
    match (matches!(a, Value::Null), matches!(b, Value::Null)) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => cmp_non_null(a, b, case_sensitive),
    }
}

/// Directional comparator: the empty layer is direction-independent
/// (empty sorts last both ways); the direction applies only to the
/// non-empty comparison.
pub fn sort_cmp_with_direction(
    a: &Value,
    b: &Value,
    case_sensitive: bool,
    direction: SortDirection,
) -> Ordering {
    sort_cmp_with_direction_and_list(a, b, case_sensitive, direction, None)
}

/// 同 [`sort_cmp_with_direction`]，但可以先按自定义序列排名比较。
///
/// 序列排名只在**两个值都不在序列里**时让位给普通类型比较，否则“未知值”
/// 之间会失去原有顺序。空单元格层完全不变：它独立于方向、也不参与排名。
pub fn sort_cmp_with_direction_and_list(
    a: &Value,
    b: &Value,
    case_sensitive: bool,
    direction: SortDirection,
    list: Option<&crate::sort_custom_list::CustomList>,
) -> Ordering {
    let (a, b) = (key_scalar(a), key_scalar(b));
    match (matches!(a, Value::Null), matches!(b, Value::Null)) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => {
            let ord = list
                .and_then(|list| crate::sort_custom_list::compare_by_rank(a, b, list, case_sensitive))
                .unwrap_or_else(|| cmp_non_null(a, b, case_sensitive));
            match direction {
                SortDirection::Ascending => ord,
                SortDirection::Descending => ord.reverse(),
            }
        }
    }
}

/// Empty placement is independent of direction; ties may use the next sort criterion.
pub(super) fn compare_key_values(key: &SortKey, a: &Value, b: &Value) -> Ordering {
    match (key.empty_first, matches!(a, Value::Null), matches!(b, Value::Null)) {
        (true, true, false) => Ordering::Less,
        (true, false, true) => Ordering::Greater,
        _ => sort_cmp_with_direction_and_list(
            a, b, key.case_sensitive, key.direction, key.custom_list.as_deref(),
        ),
    }
}
