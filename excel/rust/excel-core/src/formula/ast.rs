//! 公式语法树的数据定义。
//!
//! 纯声明，没有解析逻辑 —— 解析器往这些形状里写，求值与结构随动
//! (`eval` / `shift`) 从这些形状里读。

use crate::cell::CellAddress;
use einfach_core::ValueError;

/// Which axes of an `Expr::Range` are unbounded (Excel-style `A:A`, `1:1`).
///
/// Phase 2 Track G: whole-column refs like `A:A` and whole-row refs like
/// `1:1` need to evaluate without materializing every cell in the
/// nominal coordinate space. We keep the AST shape as
/// `Range { start: CellAddress, end: CellAddress }` (so all dense paths
/// stay unchanged) and carry the unboundedness as a discriminator:
///
/// - `None` — fully bounded range, e.g. `A1:B3`. `start` / `end` are the
///   user-supplied corners.
/// - `Rows` — whole-column range, e.g. `A:A` or `A:C`. `start.row` and
///   `end.row` are sentinels (`0` and `u32::MAX`); `start.col` / `end.col`
///   carry the user-supplied column corners.
/// - `Cols` — whole-row range, e.g. `1:1` or `1:3`. `start.col` and
///   `end.col` are sentinels (`0` and `u32::MAX`); `start.row` / `end.row`
///   carry the user-supplied row corners.
/// - `Both` — whole-sheet range. Not produced by the parser yet but
///   reserved so a future `A:XFD` shorthand has a place to land.
///
/// `shift::map_addrs` and `shift::shift_refs` are invariant on the
/// unbounded axis (inserting a row inside column A doesn't move the
/// `A:A` corners); `render_formula` round-trips the original syntax.
/// Dependency registration retains a canonical `CellRange` covering the
/// entire sheet on the unbounded axis. Formula evaluation maps it to lazy
/// Store geometry roots without expanding the coordinate space.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RangeBounds {
    None,
    Rows,
    Cols,
    Both,
}

impl RangeBounds {
    pub fn rows_unbounded(self) -> bool {
        matches!(self, RangeBounds::Rows | RangeBounds::Both)
    }
    pub fn cols_unbounded(self) -> bool {
        matches!(self, RangeBounds::Cols | RangeBounds::Both)
    }
}

/// Which horizontal band of a Table an `Expr::TableRef` selects (design doc
/// #32 §5.1 `special`). The `#special` keyword — or its absence — maps to
/// one of these at parse time; the evaluator turns the band + the table's
/// registry geometry into a concrete row range (§5.3).
///
/// - `All` — every row (header + data + totals). Syntax `Table1[#All]`.
/// - `Data` — data rows only (the parser's default when a bare column or
///   segment is given, e.g. `Table1[Col]`). Syntax `Table1[#Data]`.
/// - `Headers` — the header row. Syntax `Table1[#Headers]`.
/// - `Totals` — the totals row (evaluates to `#REF!` when the table has
///   no totals row). Syntax `Table1[#Totals]`.
/// - `ThisRow` — the intersection of the referencing formula's own row
///   with the table's data area. Syntax `[@Col]`, `Table1[@Col]`, or
///   `Table1[#This Row]`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableArea {
    All,
    Data,
    Headers,
    Totals,
    ThisRow,
}

/// Absolute-reference markers for one address as it is WRITTEN in a formula
/// (`$A$1`). Each axis pins independently: `$A1` pins the column, `A$1` pins
/// the row, `$A$1` pins both, `A1` pins neither (`RefAbs::REL`, the
/// `Default`).
///
/// Absoluteness is purely a written form. It NEVER changes how a reference
/// evaluates — `$A$1` and `A1` read the same cell — and it NEVER changes how
/// structural row/column inserts/deletes move the address: Excel shifts
/// `$A$5` to `$A$6` on a row insert, exactly like `A5`. The flags ride along
/// with the address through `shift`/`map_addrs` so the `$` survives shifts
/// and text round-trips. Drag-fill's pin-on-fill semantics are a host
/// concern (TS clipboard layer) and deliberately NOT modeled here.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct RefAbs {
    /// Column pinned with a leading `$` (`$A1`).
    pub col: bool,
    /// Row pinned with a `$` before the row number (`A$1`).
    pub row: bool,
}

impl RefAbs {
    /// Fully relative (`A1`) — the overwhelmingly common case and the
    /// `Default`.
    pub const REL: RefAbs = RefAbs {
        col: false,
        row: false,
    };
    /// Fully absolute (`$A$1`).
    pub const ABS: RefAbs = RefAbs {
        col: true,
        row: true,
    };
    pub fn new(col: bool, row: bool) -> Self {
        RefAbs { col, row }
    }
}

/// Absolute-reference markers for the two corners of a range (`$A$1:$B$2`).
/// The corners are independent, so mixed forms like `$A1:B$2` are
/// representable. `Default` / `RangeAbs::REL` is both corners relative.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct RangeAbs {
    pub start: RefAbs,
    pub end: RefAbs,
}

impl RangeAbs {
    /// Both corners relative (`A1:B2`).
    pub const REL: RangeAbs = RangeAbs {
        start: RefAbs::REL,
        end: RefAbs::REL,
    };
    pub fn new(start: RefAbs, end: RefAbs) -> Self {
        RangeAbs { start, end }
    }
}

/// AST node for a formula expression.
#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    /// 实参列表里的**空占位** —— `=SUM(1,,2)` / `=XLOOKUP(a,b,c,,0)` 的
    /// 那个空槽。Excel 允许中间或末尾的实参留空表示「取默认值」。
    ///
    /// 求值成 `Value::Null`（空值），**不是**「参数不存在」：`args.len()`
    /// 照常把空槽算进去，各函数对空值的既有处理照旧生效。这与 TS 引擎的
    /// `OmittedExpr`（`excel/excel-core-ts/src/types.ts`）是同一条语义，
    /// 两侧必须同答案。
    ///
    /// 只在**函数实参列表**里产生（`formula/operators.rs::parse_func_arg`）。
    /// 数组字面量 `{1,,2}` 与联合区域 `(A1:A3,)` 仍是解析错误 —— Excel
    /// 那两处也不接受空槽。
    ///
    /// 结构随动对它是恒等（没有地址）、渲染成空串（逗号由实参列表自己
    /// 打），所以 `=SUM(1,,2)` 插行后照样渲染回 `=SUM(1,,2)`。
    Omitted,
    /// A literal number, e.g. 42, 3.14
    Number(f64),
    /// A literal string, e.g. "hello"
    Text(String),
    /// Literal TRUE / FALSE.
    Bool(bool),
    /// Literal Excel error token, e.g. `#N/A`, `#VALUE!`, `#CALC!`.
    Error(ValueError),
    /// A cell reference, e.g. `A1`, `$A$1`, `$A1`, `A$1`. The `RefAbs`
    /// records which axes were written with a `$`; it does not affect eval.
    CellRef(CellAddress, RefAbs),
    /// Binary operation: left op right
    BinOp {
        op: BinOperator,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    /// Unary negation: -expr
    Negate(Box<Expr>),
    /// 后缀百分号：`50%` → `Percent(Number(50))`，求值时除以 100。
    ///
    /// Excel 里 `%` 是**后缀一元**运算符，不是取模 —— Excel 根本没有取模
    /// 运算符（要取模用 `MOD()`）。优先级见 `formula/operators.rs` 的
    /// `parse_percent`。
    Percent(Box<Expr>),
    /// Function call: name(arg1, arg2, ...)
    FuncCall { name: String, args: Vec<Expr> },
    /// Cell range: `A1:B3` (bounded), `A:A` / `A:C` (whole columns),
    /// `1:1` / `1:3` (whole rows). For unbounded axes, `start` / `end`
    /// carry sentinel coordinates (`0` and `u32::MAX`) on that axis —
    /// see [`RangeBounds`] for details.
    Range {
        start: CellAddress,
        end: CellAddress,
        unbounded: RangeBounds,
        /// Per-corner `$` markers (`$A$1:$B$2`, `$A1:B$2`, ...). Purely a
        /// written form; does not affect eval or how corners shift.
        abs: RangeAbs,
    },
    /// Cross-sheet reference: `Sheet1!A1`. Resolution requires a Workbook
    /// scope at eval time; standalone Sheet eval treats it as #REF!.
    SheetRef {
        sheet: String,
        addr: CellAddress,
        abs: RefAbs,
    },
    /// Cross-sheet range: `Sheet1!A1:B3`. Kept distinct from `Range` so
    /// sheet-local dependency walkers never register the source addresses on
    /// the formula's own sheet.
    SheetRange {
        sheet: String,
        start: CellAddress,
        end: CellAddress,
        unbounded: RangeBounds,
        abs: RangeAbs,
    },
    /// Dynamic-array spill reference: `A1#` / `Sheet1!A1#`. The anchor is
    /// restricted to a single-cell reference at parse time.
    SpillRef(Box<Expr>),
    /// Range operator with a reference-returning expression endpoint, e.g.
    /// `A1:INDEX(A:A,3)`. Static `A1:B2` stays as `Expr::Range`.
    DynamicRange { start: Box<Expr>, end: Box<Expr> },
    /// A bare identifier that doesn't parse as a cell ref, function call,
    /// or boolean literal — e.g. `x` in `LET(x, 5, x*x)`. The evaluator
    /// resolves the name against the current LET scope (and, in future,
    /// named ranges); otherwise it surfaces `#NAME?`.
    Name(String),
    /// Immediate application of a computed callee — produced by trailing
    /// `(args)` on a non-identifier primary. The canonical case is
    /// `=LAMBDA(x, x*x)(5)`: `LAMBDA(...)` parses as a `FuncCall` and
    /// the trailing `(5)` wraps it in a `Call`. The evaluator evaluates
    /// the callee (must yield `Value::Lambda`), then applies it to the
    /// argument values.
    ///
    /// Why a separate variant rather than reusing `FuncCall` with a
    /// computed name? `FuncCall` carries a `String` (always upper-cased
    /// built-in name); the callee here is an arbitrary expression that
    /// resolves to a lambda value at runtime. Keeping them distinct
    /// means parser and eval stay simple and existing `FuncCall`
    /// dispatch keeps O(1).
    Call(Box<Expr>, Vec<Expr>),
    /// Excel constant-array literal: `={1,2,3;4,5,6}`. `,` separates
    /// columns, `;` separates rows. `data` is row-major, so the cell at
    /// `(row, col)` lives at `data[row * cols + col]`. The parser
    /// restricts cell expressions to literals (numbers, text, booleans,
    /// errors, or `Negate(Number)` for signed numerics); cell refs, function
    /// calls, ranges, etc. inside the literal are a parse error — those
    /// are not the Excel constant-array form. Eval lowers this directly
    /// to `Value::Array`.
    ArrayLit {
        rows: u32,
        cols: u32,
        data: Vec<Expr>,
    },
    /// Excel multi-area (union) reference: `(A1:B2, D5:E6, F1)`. Each
    /// inner expression is itself a reference (`CellRef`, `Range`,
    /// `SheetRef`, or `SheetRange`) — arbitrary expressions are
    /// rejected at parse time (a `(A1, 1+2)` shape is a parse error,
    /// not a `MultiArea`). The parser only emits this when ≥ 2 refs are
    /// separated by commas inside parentheses; `(A1:B2)` is just the
    /// grouped single ref `A1:B2`.
    ///
    /// Eval contract: `Expr::MultiArea` doesn't reduce to a scalar
    /// `Value`. The bare expression yields `#VALUE!` and built-ins that
    /// take a single range argument (SUM, AVERAGE, INDEX, ...) also
    /// surface `#VALUE!`. The only consumer that handles it as data is
    /// `AREAS`, which counts the parts. Future work may extend SUMIF /
    /// COUNTIF criteria-range handling.
    MultiArea(Vec<Expr>),
    /// Structured (Excel Table) reference: `Table1[Col]`, `[@Col]`,
    /// `Table1[#Headers]`, `Table1[[ColA]:[ColB]]`, etc. (design doc #32
    /// §5.1 / §5.2). The node is resolved to a concrete `SheetRange` at
    /// eval time against the workbook's Table registry (§5.3) — the AST
    /// carries NO A1 coordinates, so structural edits follow it through
    /// the registry rather than by rewriting this node.
    ///
    /// - `table` — `Some(name)` for `Table1[...]`; `None` for a table-less
    ///   `[Col]` / `[@Col]` written inside a table's own cells, where the
    ///   evaluator locates the containing table from the current cell.
    /// - `area` — which horizontal band (see [`TableArea`]).
    /// - `columns` — `None` for the whole area (`Table1[#All]`); `Some((a,
    ///   a))` for a single column; `Some((a, b))` for a `[ColA]:[ColB]`
    ///   segment. Column names are matched case-insensitively at eval time.
    TableRef {
        table: Option<String>,
        area: TableArea,
        columns: Option<(String, String)>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinOperator {
    Add,
    Sub,
    Mul,
    Div,
    /// Exponent (`^`).
    Pow,
    /// String concatenation (`&`).
    Concat,
    Eq,
    NotEq,
    Lt,
    LtEq,
    Gt,
    GtEq,
}
