//! 一次 sheet 操作可能失败的方式。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Errors returned by the `try_*` write APIs on `Sheet`. The plain
/// `set_cell` / `set_formula` family stays infallible for backwards
/// compatibility with existing callers; the `try_*` family surfaces the same
/// outcome as a `Result` so hosts can report the failure to the user.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SheetError {
    /// UNREACHABLE since ADR 0006 stage 1 — kept, not deleted.
    ///
    /// It used to mean "the target address is part of an active spill range
    /// whose anchor lives elsewhere; clear or shrink the anchor first". Such a
    /// write now lands and withdraws the array instead (Excel semantics), so
    /// no engine path constructs this variant any more.
    ///
    /// The variant survives because `excel/rust/wasm`'s error mapping matches
    /// on it and INV-4 freezes that boundary's shape. Deleting it is a separate
    /// change, coordinated with the JS side (`cell-write-reject.ts`'s
    /// `'spill-write'` branch is likewise dead code now).
    SpillCellWrite { anchor: CellAddress },
    /// The supplied address string failed to parse as `A1`-style. Mirrors
    /// the panic that the infallible variants raise; surfaced as an error
    /// in the `try_*` variants so worker hosts don't crash on bad input.
    InvalidAddress,
    /// Wave 8 re-entrancy guard: the workbook attempted to mutate while
    /// a host custom-formula JS callback was executing. The mutation is
    /// rejected so the transitional workbook-evaluation state stays sound (see
    /// `Workbook::is_inside_custom_call` and
    /// `CUSTOM_FORMULAS.md` § "No mutations during callback").
    MutationDuringCustomCall,
}

impl std::fmt::Display for SheetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SheetError::SpillCellWrite { anchor } => write!(
                f,
                "cannot write to cell inside spill range anchored at {}",
                anchor
            ),
            SheetError::InvalidAddress => write!(f, "invalid cell address"),
            SheetError::MutationDuringCustomCall => write!(
                f,
                "workbook mutations are forbidden while a custom-formula callback is executing"
            ),
        }
    }
}

impl std::error::Error for SheetError {}
