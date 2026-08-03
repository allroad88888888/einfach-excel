//! `retarget.rs` 的单元测试：插删行列之后地址跟着动、`$` 标记留在原地。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `formula/lexer_tests.rs` 同一套做法。

use super::*;
use crate::formula::parse_formula;
use crate::shift::{render_formula, ShiftEdit};

#[test]
fn structural_shift_preserves_absolute_markers() {
    // Requirement #3 (hydrated path): Excel shifts `$A$5` to `$A$6` on a
    // row insert — the ADDRESS moves, the `$` markers STAY.
    let shift = |src: &str, edit: ShiftEdit| {
        let expr = parse_formula(src).unwrap();
        render_formula(&map_addrs(&expr, &|a| edit.apply(a)))
    };
    assert_eq!(
        shift("=$A$5", ShiftEdit::RowInsert { at: 0, count: 1 }),
        "=$A$6"
    );
    assert_eq!(
        shift("=SUM($A$2:$B$4)", ShiftEdit::RowInsert { at: 0, count: 2 }),
        "=SUM($A$4:$B$6)"
    );
    assert_eq!(
        shift("=$A2:B$4", ShiftEdit::ColInsert { at: 0, count: 1 }),
        "=$B2:C$4"
    );
    // Absolute whole-column keeps `$` while the column shifts.
    assert_eq!(
        shift("=SUM($B:$C)", ShiftEdit::ColInsert { at: 0, count: 1 }),
        "=SUM($C:$D)"
    );
    // Deleting the referenced row still collapses to #REF!, `$` or not.
    assert_eq!(
        shift("=$A$5", ShiftEdit::RowDelete { at: 4, count: 1 }),
        "=#REF!"
    );
}
