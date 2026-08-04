//! 稀疏大区间上聚合的流式遍历。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use crate::formula::parse_formula;
use std::cell::Cell;

// === LAZY Step 4: range streaming tests ===
//
// The four tests below exercise the streaming/stateful split via a
// synthetic SparseProvider that exposes a visit counter. SheetEval-
// Provider's sparse override is exercised separately in
// `sheet::tests::*` and `workbook::tests::*`.

/// Provider backed by a sparse HashMap. Counts every `cell()` /
/// `for_each_range_cell` visit so tests can assert "we walked the
/// real cells, not the full rectangle."
struct SparseProvider {
    cells: HashMap<CellAddress, Value>,
    visits: Cell<u64>,
}

impl SparseProvider {
    fn new() -> Self {
        SparseProvider {
            cells: HashMap::new(),
            visits: Cell::new(0),
        }
    }
    fn set(&mut self, addr: &str, v: Value) {
        self.cells.insert(CellAddress::parse(addr).unwrap(), v);
    }
    fn visits(&self) -> u64 {
        self.visits.get()
    }
}

impl EvalProvider for SparseProvider {
    fn cell(&self, addr: CellAddress) -> Value {
        self.visits.set(self.visits.get() + 1);
        self.cells.get(&addr).cloned().unwrap_or(Value::Null)
    }
    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Error(ValueError::InvalidRef)
    }
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        // Walk only addresses we actually have, intersected with the
        // requested range. Sparse traversal — the visit count equals
        // the number of present cells inside `range`, NOT the
        // rectangle's `cell_count`.
        let n = range.normalize();
        for (addr, value) in &self.cells {
            if addr.row >= n.start.row
                && addr.row <= n.end.row
                && addr.col >= n.start.col
                && addr.col <= n.end.col
            {
                self.visits.set(self.visits.get() + 1);
                f(*addr, value.clone());
            }
        }
    }

    fn for_each_sheet_range_cell(
        &self,
        _sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        self.for_each_range_cell(range, f);
    }
}

fn run_with(provider: &SparseProvider, formula: &str) -> Value {
    let expr = parse_formula(formula).expect("parse failed");
    eval_expr_with_provider(&expr, provider)
}

#[test]
fn sum_walks_only_real_cells_in_huge_range() {
    // A1=5, A100000=10. SUM(A1:A100000) over the synthetic sparse
    // provider must visit exactly 2 cells, not 100_000.
    let mut p = SparseProvider::new();
    p.set("A1", Value::Number(5.0));
    p.set("A100000", Value::Number(10.0));
    let v = run_with(&p, "=SUM(A1:A100000)");
    assert_eq!(v, Value::Number(15.0));
    assert_eq!(
        p.visits(),
        2,
        "SUM should stream only the 2 real cells (got {})",
        p.visits()
    );
}

#[test]
fn sum_cross_sheet_range_streams_only_real_cells() {
    let mut p = SparseProvider::new();
    p.set("A1", Value::Number(5.0));
    p.set("A100000", Value::Number(10.0));
    let v = run_with(&p, "=SUM(Sheet2!A1:A100000)");
    assert_eq!(v, Value::Number(15.0));
    assert_eq!(
        p.visits(),
        2,
        "cross-sheet SUM should stream only present cells, got {}",
        p.visits()
    );
}

#[test]
fn count_range_with_holes() {
    // A1=1, A3=2, A5=3 (A2/A4 empty). COUNT(A1:A5) = 3 since COUNT
    // counts numeric values and skips empty/non-numeric — matches
    // Excel.
    let mut p = SparseProvider::new();
    p.set("A1", Value::Number(1.0));
    p.set("A3", Value::Number(2.0));
    p.set("A5", Value::Number(3.0));
    let v = run_with(&p, "=COUNT(A1:A5)");
    assert_eq!(v, Value::Number(3.0));
}

#[test]
fn average_streaming_matches_eager() {
    // Build a small range and compare =AVERAGE(...) against manual
    // sum/count to confirm result equivalence with the old eager
    // collect_range_values path.
    let mut p = SparseProvider::new();
    let nums = [3.0, 7.5, 11.0, -2.0, 0.5, 100.0, 42.0, 8.0];
    let mut row = 0u32;
    for n in nums.iter() {
        let addr = CellAddress::new(row, 0).to_string_repr();
        p.set(&addr, Value::Number(*n));
        row += 1;
    }
    let v = run_with(&p, "=AVERAGE(A1:A8)");
    let expected = nums.iter().sum::<f64>() / nums.len() as f64;
    assert_eq!(v, Value::Number(expected));
}

#[test]
fn min_max_stream_sparse_range() {
    // MIN / MAX on a sparse range visit each non-empty cell exactly
    // once, with no Vec materialization.
    let mut p = SparseProvider::new();
    p.set("A1", Value::Number(5.0));
    p.set("A50", Value::Number(-2.5));
    p.set("A1000", Value::Number(100.0));
    assert_eq!(run_with(&p, "=MIN(A1:A1000)"), Value::Number(-2.5));
    assert_eq!(run_with(&p, "=MAX(A1:A1000)"), Value::Number(100.0));
}

#[test]
fn median_stateful_still_works_over_streaming() {
    // MEDIAN keeps its temp Vec, but goes through for_each_arg_value
    // so no atoms get created. Result equivalence with eager path
    // is the contract.
    let mut p = SparseProvider::new();
    for (i, n) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        let addr = CellAddress::new(i as u32, 0).to_string_repr();
        p.set(&addr, Value::Number(*n));
    }
    let v = run_with(&p, "=MEDIAN(A1:A5)");
    assert_eq!(v, Value::Number(3.0));
}

#[test]
fn countif_sumif_stream_sparse_range() {
    // Sparse range; criteria filter is applied during streaming.
    let mut p = SparseProvider::new();
    p.set("A1", Value::Number(10.0));
    p.set("A500", Value::Number(20.0));
    p.set("A999", Value::Number(2.0));
    assert_eq!(
        run_with(&p, "=COUNTIF(A1:A1000,\">5\")"),
        Value::Number(2.0)
    );
    assert_eq!(run_with(&p, "=SUMIF(A1:A1000,\">5\")"), Value::Number(30.0));
}
