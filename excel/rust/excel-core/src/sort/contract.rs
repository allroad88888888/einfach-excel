//! Public contract for native physical sorting.

use crate::cell::CellAddress;

/// Sort direction for one key. Descending reverses the comparison of the
/// non-empty classes only — empty cells sink to the end either way.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortDirection {
    Ascending,
    Descending,
}

/// One sort key: an absolute (0-based) column that must fall inside the
/// sorted range's column span.
///
/// `custom_list` 是本键的「自定义序列」：有值时先按序列排名比较，两个值
/// 都不在序列里才回退到普通类型比较（见 [`crate::sort_custom_list`]）。
/// 序列随键一起提交而不是引用工作簿目录，所以一个 `SortKey` 就能完整描述
/// 一次排序；`Arc` 只是让 8 个键共用一份排名表而不重复建表。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SortKey {
    /// Absolute column index (0-based), inside the range's column span.
    pub col: u32,
    pub direction: SortDirection,
    /// Case-sensitive text comparison; Excel default is `false`.
    pub case_sensitive: bool,
    /// True places genuinely empty cells first in either direction; empty text remains text.
    pub empty_first: bool,
    /// 自定义序列：`None` 等于“按值排序”（历史行为）。
    pub custom_list: Option<std::sync::Arc<crate::sort_custom_list::CustomList>>,
}

impl Default for SortKey {
    /// Ascending value sort on the first column; key bounds are checked on use.
    fn default() -> Self {
        SortKey {
            col: 0,
            direction: SortDirection::Ascending,
            case_sensitive: false,
            empty_first: false,
            custom_list: None,
        }
    }
}

/// Result witness for a completed `sort_range`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SortRangeReport {
    /// Number of visible slots whose source row changed; 0 means no-op.
    pub moved_rows: u32,
    /// Number of non-empty cells relocated by the permutation.
    pub moved_cells: u32,
    /// Permutation witness for changed slots only:
    /// `(slot row, row that occupied the slot before the sort)`.
    /// Reserved for overlay remap / parity assertions; v1 consumers may
    /// ignore it.
    pub row_permutation: Vec<(u32, u32)>,
}

/// Structured rejections. The sort never partially applies: any `Err`
/// leaves the sheet untouched.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortRangeError {
    /// Current native protection forbids changing at least one addressed cell.
    ProtectedRange,
    /// Range exceeds the Excel grid, or (workbook entry point) the sheet
    /// index does not exist.
    InvalidRange,
    EmptyKeys,
    /// A key column falls outside the range's column span.
    KeyOutOfRange,
    /// 合并布局不能跟随普通行置换；先取消合并再排序。
    MergeIntersectsRange,
    /// The range intersects an active spill (anchor or target). Aligned
    /// with Excel's "can't change part of an array" rejection.
    SpillIntersectsRange {
        anchor: CellAddress,
    },
}
