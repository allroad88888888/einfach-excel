//! ADR 0006 两阶段测试共用的夹具。
//!
//! 阶段 1（写入落地、数组收回）与阶段 2（阻塞物消失后复活）分散在五个测试
//! 二进制里，它们共用同一个 `=SEQUENCE(4)` 起始态和同一套"数组确实收回了"的
//! 判据。抄五份会让判据各自漂移 —— 而这套判据正是 ADR 的验收标准本身。
//!
//! `tests/` 下的每个文件都是独立 crate，所以这里的每个条目对任一具体调用方
//! 都可能是未使用的；模块级 `allow(dead_code)` 是这个形状的代价，不是疏漏。
#![allow(dead_code)]

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Sheet};

pub fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

pub fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end)).normalize()
}

/// `=SEQUENCE(4)` at H1, spilled into H2:H4.
pub fn column_spill_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("H1", "=SEQUENCE(4)"));
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "spill landed");
    sheet
}

/// Assert the array is gone: anchor at `#SPILL!`, every projection cell but
/// `written` back to empty, and the spill bookkeeping empty.
pub fn assert_collapsed(sheet: &Sheet, anchor: &str, ghosts: &[&str]) {
    assert_eq!(
        sheet.get_cell(anchor),
        Value::Error(ValueError::Spill),
        "{anchor} must project #SPILL! after the write"
    );
    for g in ghosts {
        assert_eq!(
            sheet.get_cell(g),
            Value::Null,
            "{g} must be empty — the whole array is withdrawn, not just the written cell"
        );
    }
    assert_eq!(sheet.spill_info(addr(anchor)), None, "no shape any more");
    assert_eq!(sheet.debug_spill_anchor_count(), 0);
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(sheet.debug_spill_reverse_index_len(), 0);
}
