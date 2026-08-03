//! 数据库函数对条件区表头的匹配规则。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::db_env::*;

#[test]
fn eval_db_bad_criteria_header() {
    // Per-decision: a non-empty criteria header that does NOT match
    // any database header → InvalidValue (#VALUE!). Authoring
    // mistakes surface loudly rather than silently matching nothing.
    let (mut cm, mut vs) = make_db_env();
    // Overwrite F1 (criteria header) with a name that doesn't exist
    // in the database.
    let id = AtomId::from_raw(950);
    cm.insert(CellAddress::new(0, 5), id);
    vs.insert(id, Value::Text("Unknown".into()));
    // F2 already holds "Eng" from the fixture; that's an OK criterion
    // *value*, but F1's header doesn't resolve. So the criteria range
    // is malformed.
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_db_case_insensitive_headers() {
    // Header lookup is case-insensitive both for `field` arg and for
    // criteria headers. We rewrite the criteria header F1 to "DEPT"
    // (uppercase). It should still resolve to the database's "Dept".
    let (mut cm, mut vs) = make_db_env();
    let id = AtomId::from_raw(960);
    cm.insert(CellAddress::new(0, 5), id);
    vs.insert(id, Value::Text("DEPT".into()));
    // `field` arg is also case-insensitive — "salary" matches "Salary".
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"salary\",F1:G2)", &cm, &vs),
        Value::Number(175000.0)
    );
}
