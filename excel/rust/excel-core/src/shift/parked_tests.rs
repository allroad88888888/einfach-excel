//! `parked.rs` 的单元测试：AUDIT A-1 契约 —— 对每一份可解析的源码，
//! `hydrate(rewrite(src))` 必须等于 `retarget(hydrate(src))`。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `formula/lexer_tests.rs` 同一套做法。

use super::*;
use crate::formula::parse_formula;
use crate::shift::{contains_invalid_ref, map_addrs};

// === AUDIT A-1 — parked-source token rewrite ===
//
// Contract under test: for every parseable source,
// `hydrate(rewrite(src))` must equal `retarget(hydrate(src))` —
// i.e. parsing the rewritten text yields the same AST as
// `map_addrs` over the parse of the original text.

fn assert_rewrite_matches_ast(src: &str, edit: ShiftEdit) {
    let rewritten = match rewrite_parked_source(src, edit) {
        SourceRewrite::Unchanged => src.to_string(),
        SourceRewrite::Rewritten(s) => s,
        SourceRewrite::DeadRef => {
            // The AST path must agree the formula dies.
            let expr = parse_formula(src).expect("parseable");
            let mapped = map_addrs(&expr, &|a| edit.apply(a));
            assert!(
                contains_invalid_ref(&mapped),
                "scanner said DeadRef but AST retarget survives: {src}"
            );
            return;
        }
    };
    let expr = parse_formula(src).expect("original must parse");
    let mapped = map_addrs(&expr, &|a| edit.apply(a));
    assert!(
        !contains_invalid_ref(&mapped),
        "AST retarget died but scanner rewrote: {src}"
    );
    let reparsed = parse_formula(&rewritten)
        .unwrap_or_else(|| panic!("rewritten must parse: {src} -> {rewritten}"));
    assert_eq!(
        mapped, reparsed,
        "rewrite mismatch for {src} -> {rewritten} under {edit:?}"
    );
}

#[test]
fn parked_rewrite_matches_ast_retarget_corpus() {
    let edits = [
        ShiftEdit::RowInsert { at: 0, count: 1 },
        ShiftEdit::RowInsert { at: 2, count: 3 },
        ShiftEdit::RowDelete { at: 0, count: 1 },
        ShiftEdit::RowDelete { at: 1, count: 2 },
        ShiftEdit::ColInsert { at: 0, count: 1 },
        ShiftEdit::ColInsert { at: 1, count: 2 },
        ShiftEdit::ColDelete { at: 0, count: 1 },
        ShiftEdit::ColDelete { at: 2, count: 1 },
    ];
    let corpus = [
        "=A1",
        "=A5+B7*2",
        "=SUM(A1:B5)",
        "=SUM(A1:A10)+IF(B1>0,B1*2,0)",
        "=SUM(A:C)",
        "=SUM(1:3)",
        "=A1:B2 + SUM( C3 : D4 )",
        "=IF(A2>0,\"A2\",\"B9\")&C3",
        "=LOG10(A2)+ATAN2(B3,C4)",
        "=Data!A1+B2",
        "=Data!A1:B3+C4",
        "=SEQUENCE(3)",
        "=B1#",
        "=INDEX(A:A,3)",
        "=A1:INDEX(B:B,5)",
        "=LET(x, A5, x*2)",
        "=TRUE+FALSE",
        "=RANK.EQ(A2,B1:B9)",
        "={1,2;3,4}",
        "=AREAS((A1:B2,D5:E6))",
        "=#REF!+A2",
        "=\"literal A1:B2 stays\"&A3",
        "=a5+b7", // lowercase refs are valid and shift
        // Absolute / mixed references: the parked scanner must match the
        // hydrated `map_addrs` retarget exactly, `$` markers included.
        "=$A$5",
        "=A$5+$B7*2",
        "=SUM($A$1:$B$5)",
        "=$A$1:B$2 + SUM( $C3 : D$4 )",
        "=SUM($A:$C)",
        "=SUM($1:$3)",
        "=Data!$A$1+$B2",
        "=$B1#",
        "=$A$1:INDEX($B:$B,5)",
        "=IF($A2>0,\"$A$2\",\"B9\")&$C3",
    ];
    for edit in edits {
        for src in corpus {
            assert_rewrite_matches_ast(src, edit);
        }
    }
}

#[test]
fn parked_rewrite_unchanged_when_refs_below_boundary() {
    // No allocation contract: refs strictly above the insert point
    // report Unchanged.
    assert_eq!(
        rewrite_parked_source("=A1+B2", ShiftEdit::RowInsert { at: 5, count: 1 }),
        SourceRewrite::Unchanged
    );
    assert_eq!(
        rewrite_parked_source("=SUM(A1:B3)", ShiftEdit::ColInsert { at: 9, count: 2 }),
        SourceRewrite::Unchanged
    );
}

#[test]
fn parked_rewrite_quoted_strings_and_function_names_survive() {
    let got = rewrite_parked_source(
        "=IF(A2>0,\"A2 ok\",\"skip B9\")&LOG10(C3)",
        ShiftEdit::RowInsert { at: 0, count: 1 },
    );
    assert_eq!(
        got,
        SourceRewrite::Rewritten("=IF(A3>0,\"A2 ok\",\"skip B9\")&LOG10(C4)".into())
    );
}

#[test]
fn parked_rewrite_cross_sheet_refs_untouched() {
    // Within-sheet edits never shift sheet-qualified refs (mirrors
    // `map_addrs`), including a sheet NAME that looks like a ref.
    assert_eq!(
        rewrite_parked_source(
            "=Data!A1+Data!B2:C3",
            ShiftEdit::RowInsert { at: 0, count: 1 }
        ),
        SourceRewrite::Unchanged
    );
    assert_eq!(
        rewrite_parked_source("=B2!A1", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Unchanged
    );
    // Same-sheet refs around a cross-sheet ref still shift.
    assert_eq!(
        rewrite_parked_source("=Data!A1+B2", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=Data!A1+B3".into())
    );
}

#[test]
fn parked_rewrite_deleted_band_is_dead() {
    assert_eq!(
        rewrite_parked_source("=B5*2", ShiftEdit::RowDelete { at: 4, count: 1 }),
        SourceRewrite::DeadRef
    );
    assert_eq!(
        rewrite_parked_source("=SUM(A1:B5)", ShiftEdit::ColDelete { at: 0, count: 1 }),
        SourceRewrite::DeadRef
    );
    // Range corner survives a delete inside the band interior.
    assert_eq!(
        rewrite_parked_source("=SUM(1:3)", ShiftEdit::RowDelete { at: 1, count: 1 }),
        SourceRewrite::Rewritten("=SUM(1:2)".into())
    );
}

#[test]
fn parked_rewrite_whole_row_whole_col_axis_rules() {
    // Row edits move whole-row ranges, leave whole-col ranges.
    assert_eq!(
        rewrite_parked_source("=SUM(2:3)", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=SUM(3:4)".into())
    );
    assert_eq!(
        rewrite_parked_source("=SUM(B:C)", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Unchanged
    );
    // Col edits: the mirror image.
    assert_eq!(
        rewrite_parked_source("=SUM(B:C)", ShiftEdit::ColInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=SUM(C:D)".into())
    );
    assert_eq!(
        rewrite_parked_source("=SUM(2:3)", ShiftEdit::ColInsert { at: 0, count: 1 }),
        SourceRewrite::Unchanged
    );
    // Deleting the pinned corner column kills a whole-row range —
    // quirky but exactly what `shift_range_corners` +
    // `contains_invalid_ref` produce on the hydrated path.
    assert_eq!(
        rewrite_parked_source("=SUM(1:3)", ShiftEdit::ColDelete { at: 0, count: 1 }),
        SourceRewrite::DeadRef
    );
    assert_eq!(
        rewrite_parked_source("=SUM(B:C)", ShiftEdit::RowDelete { at: 0, count: 1 }),
        SourceRewrite::DeadRef
    );
}

#[test]
fn parked_rewrite_hostile_text_never_panics() {
    // Garbage sources (reachable via bulk_install_storage, which
    // parks without validating) must scan without panicking —
    // including letter runs that would overflow the naive
    // column-letter arithmetic.
    for src in [
        "=ABCDEFGHIJKLMNOP123",
        "=ZZZZZZZZZZ:ZZZZZZZZZZ",
        "=99999999999999999999:3",
        "=1.5:3",
        "=A1++",
        "=\"unterminated",
        "=日本語+A2",
        "=0:0",
    ] {
        let _ = rewrite_parked_source(src, ShiftEdit::RowInsert { at: 0, count: 1 });
        let _ = rewrite_parked_source(src, ShiftEdit::ColDelete { at: 0, count: 1 });
    }
}

#[test]
fn parked_rewrite_spill_ref_shifts_anchor() {
    assert_eq!(
        rewrite_parked_source("=B1#", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=B2#".into())
    );
}
#[test]
fn parked_rewrite_absolute_refs_preserve_markers() {
    // Requirement #3 (lazy/parked path): the token scanner shifts the
    // address and re-emits the `$`.
    assert_eq!(
        rewrite_parked_source("=$A$5", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=$A$6".into())
    );
    assert_eq!(
        rewrite_parked_source("=A$5*$B2", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=A$6*$B3".into())
    );
    assert_eq!(
        rewrite_parked_source("=SUM($A$2:$B$4)", ShiftEdit::ColInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=SUM($B$2:$C$4)".into())
    );
    // Cross-sheet absolute refs are NOT shifted by a within-sheet edit.
    assert_eq!(
        rewrite_parked_source("=Data!$A$1+$B$2", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=Data!$A$1+$B$3".into())
    );
    // Absolute whole-column / whole-row keep `$` on the bounded axis.
    assert_eq!(
        rewrite_parked_source("=SUM($B:$C)", ShiftEdit::ColInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=SUM($C:$D)".into())
    );
    assert_eq!(
        rewrite_parked_source("=SUM($2:$3)", ShiftEdit::RowInsert { at: 0, count: 1 }),
        SourceRewrite::Rewritten("=SUM($3:$4)".into())
    );
    // Deleting the referenced row kills the formula, absolute or not.
    assert_eq!(
        rewrite_parked_source("=$B$5", ShiftEdit::RowDelete { at: 4, count: 1 }),
        SourceRewrite::DeadRef
    );
}
