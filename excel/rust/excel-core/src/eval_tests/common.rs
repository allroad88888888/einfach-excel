//! 跨家族共用的测试夹具与断言工具。
//!
//! 收录判据只有一条：**被两个以上家族用到**。单个家族自用的夹具留在该家族
//! 的文件里（或该家族的 `*_env` / `*_support` 文件），不往这里堆。
//!
//! - `eval_str`：把一条公式串解析并求值成 `Value` 的唯一入口，39 个家族都经它下钻。
//! - `make_test_env`：A1=10 / B1=20 / C1=0 / A2=5 / B2="text" 这份最小单元格夹具，30 个家族共用。
//! - `empty_env`：不含任何单元格的空环境，`ev` 与自定义公式、定义名两族都要。
//! - `ev`：`eval_str` + `empty_env` 的简写，纯函数式公式（无单元格引用）都用它，16 个家族。
//! - `assert_approx_eq`：浮点结果的容差断言，7 个数值家族共用。
//! - `approx`：两个 f64 是否落在容差内的谓词，6 个家族共用。
//! - `TOL`：上面两个断言的默认容差，4 个统计家族共用。
//! - `assert_num_close`：以公式串为入参的容差断言，分布/检验/双曲三族共用。
//! - `unwrap_array`：把 `Value::Array` 拆成 (rows, cols, data)，动态数组/统计/检验三族共用。
//! - `make_math_env`：矩阵与数值夹具，math_roman / math_rounding / matrix / stats_regression 四族共用。
//! - `make_stat_env`：统计数据集夹具，dispersion / rank_percentile / regression 三族共用。
//!
//! 层级与 import 约定见 `mod.rs`。

use super::super::*;
use crate::formula::parse_formula;

pub(super) fn make_test_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Simulate: A1=10, B1=20, C1=0, A2=5, B2="text"
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();

    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    let c1 = AtomId::from_raw(2);
    let a2 = AtomId::from_raw(3);
    let b2 = AtomId::from_raw(4);

    cell_map.insert(CellAddress::new(0, 0), a1); // A1
    cell_map.insert(CellAddress::new(0, 1), b1); // B1
    cell_map.insert(CellAddress::new(0, 2), c1); // C1
    cell_map.insert(CellAddress::new(1, 0), a2); // A2
    cell_map.insert(CellAddress::new(1, 1), b2); // B2

    values.insert(a1, Value::Number(10.0));
    values.insert(b1, Value::Number(20.0));
    values.insert(c1, Value::Number(0.0));
    values.insert(a2, Value::Number(5.0));
    values.insert(b2, Value::Text("text".into()));

    (cell_map, values)
}

pub(super) fn eval_str(
    formula: &str,
    cell_map: &HashMap<CellAddress, AtomId>,
    values: &HashMap<AtomId, Value>,
) -> Value {
    let expr = parse_formula(formula).expect("parse failed");
    let get = |id: AtomId| -> Value { values.get(&id).cloned().unwrap_or(Value::Null) };
    eval_expr(&expr, &get, cell_map)
}

// === Statistical extensions: AVERAGEA / RANK / RANKEQ / RANKAVG /
//                             PERCENTILE / QUARTILE / CORREL / SLOPE /
//                             INTERCEPT.

/// Builds a richer test env with named numeric columns/rows for stats:
/// A1..A5 = 2, 4, 6, 8, 10
/// B1..B5 = 1, 3, 5, 7, 9     (perfectly correlated with A: B = A/2 + 0.5? not exactly — see below)
/// Actually B1..B5 = 4, 8, 12, 16, 20 → exactly 2*A (linear, perfectly correlated).
/// C1..C5 = 10, 8, 6, 4, 2    → inversely correlated with A.
/// D1 = TRUE-encoded as Boolean, D2 = FALSE, D3 = "hello" (text),
/// D4 = Null (not inserted), D5 = 5 (number).
pub(super) fn make_stat_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let mut next_id: u64 = 0;
    let insert = |row: u32,
                  col: u32,
                  v: Value,
                  cm: &mut HashMap<CellAddress, AtomId>,
                  vs: &mut HashMap<AtomId, Value>,
                  next: &mut u64| {
        let id = AtomId::from_raw(*next);
        *next += 1;
        cm.insert(CellAddress::new(row, col), id);
        vs.insert(id, v);
    };
    // Column A: 2, 4, 6, 8, 10.
    for (i, n) in [2.0, 4.0, 6.0, 8.0, 10.0].iter().enumerate() {
        insert(
            i as u32,
            0,
            Value::Number(*n),
            &mut cell_map,
            &mut values,
            &mut next_id,
        );
    }
    // Column B = 2*A: 4, 8, 12, 16, 20 (perfect positive correlation).
    for (i, n) in [4.0, 8.0, 12.0, 16.0, 20.0].iter().enumerate() {
        insert(
            i as u32,
            1,
            Value::Number(*n),
            &mut cell_map,
            &mut values,
            &mut next_id,
        );
    }
    // Column C = inverse of A: 10, 8, 6, 4, 2 (perfect negative correlation).
    for (i, n) in [10.0, 8.0, 6.0, 4.0, 2.0].iter().enumerate() {
        insert(
            i as u32,
            2,
            Value::Number(*n),
            &mut cell_map,
            &mut values,
            &mut next_id,
        );
    }
    // Column D: mixed-type column for AVERAGEA.
    insert(
        0,
        3,
        Value::Boolean(true),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    insert(
        1,
        3,
        Value::Boolean(false),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    insert(
        2,
        3,
        Value::Text("hello".into()),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    // D4 intentionally absent → Null.
    insert(
        4,
        3,
        Value::Number(5.0),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    // Column E: contains ties for RANK.AVG (10, 10, 5).
    insert(
        0,
        4,
        Value::Number(10.0),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    insert(
        1,
        4,
        Value::Number(10.0),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    insert(
        2,
        4,
        Value::Number(5.0),
        &mut cell_map,
        &mut values,
        &mut next_id,
    );
    (cell_map, values)
}

pub(super) fn approx(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() < tol
}

// --- Math extras: pair-of-arrays sums, SUMSQ, SQRTPI, SUMPRODUCT,
// FLOOR.MATH / CEILING.MATH / FLOOR.PRECISE / CEILING.PRECISE,
// ROMAN / ARABIC / DECIMAL / BASE, MDETERM ---

/// Environment for math-extras tests.
/// Layout:
///   A1=1 A2=2 A3=3 A4=4 A5=5       (x-array / single-column block)
///   B1=2 B2=4 B3=6 B4=8 B5=10      (y-array = 2*x)
///   C1=-2.5 C2=-1.5 C3=10.5 C4=11.5 (rounding fodder)
///   D1="text"                       (non-numeric)
///   2×2 MDETERM input at E1..F2:    [[1,2],[3,4]]
///   3×3 identity at G1..I3
pub(super) fn make_math_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let mut next: u64 = 0;
    let mut put = |row: u32,
                   col: u32,
                   v: Value,
                   cm: &mut HashMap<CellAddress, AtomId>,
                   vs: &mut HashMap<AtomId, Value>| {
        let id = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(row, col), id);
        vs.insert(id, v);
    };
    for (i, n) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        put(i as u32, 0, Value::Number(*n), &mut cm, &mut vs);
    }
    for (i, n) in [2.0, 4.0, 6.0, 8.0, 10.0].iter().enumerate() {
        put(i as u32, 1, Value::Number(*n), &mut cm, &mut vs);
    }
    put(0, 2, Value::Number(-2.5), &mut cm, &mut vs);
    put(1, 2, Value::Number(-1.5), &mut cm, &mut vs);
    put(2, 2, Value::Number(10.5), &mut cm, &mut vs);
    put(3, 2, Value::Number(11.5), &mut cm, &mut vs);
    put(0, 3, Value::Text("text".into()), &mut cm, &mut vs);
    // 2×2 at E1:F2 = [[1,2],[3,4]]  (cols 4 and 5, rows 0 and 1)
    put(0, 4, Value::Number(1.0), &mut cm, &mut vs);
    put(0, 5, Value::Number(2.0), &mut cm, &mut vs);
    put(1, 4, Value::Number(3.0), &mut cm, &mut vs);
    put(1, 5, Value::Number(4.0), &mut cm, &mut vs);
    // 3×3 identity at G1:I3 (cols 6..8, rows 0..2). Empty cells
    // are Null = 0.0 in the determinant, so we only set diagonals.
    put(0, 6, Value::Number(1.0), &mut cm, &mut vs);
    put(1, 7, Value::Number(1.0), &mut cm, &mut vs);
    put(2, 8, Value::Number(1.0), &mut cm, &mut vs);
    (cm, vs)
}

// === Dynamic-array (spill) functions ===

/// Helper: extract `(rows, cols, data)` from a `Value::Array` result
/// or panic with a useful message. Mirrors the helpers in
/// `tests/spill_infra.rs`.
pub(super) fn unwrap_array(v: Value) -> (u32, u32, Vec<Value>) {
    match v {
        Value::Array(arr) => {
            let (r, c) = arr.shape();
            (r, c, arr.data.clone())
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

pub(super) fn assert_approx_eq(actual: Value, expected: f64, tol: f64) {
    match actual {
        Value::Number(n) => {
            let diff = (n - expected).abs();
            assert!(
                diff < tol,
                "expected ≈ {} (tol={}), got {} (|diff|={})",
                expected,
                tol,
                n,
                diff
            );
        }
        other => panic!("expected Value::Number, got {:?}", other),
    }
}

pub(super) fn empty_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    (HashMap::new(), HashMap::new())
}

pub(super) fn ev(formula: &str) -> Value {
    let (cm, vs) = empty_env();
    eval_str(formula, &cm, &vs)
}

pub(super) const TOL: f64 = 1e-6;

// === T-batch cleanup tests (Q1 2026) ===
//
// Helper: tight numeric assertion against `Value::Number(n)` with a
// configurable tolerance so we don't pollute every test with the
// pattern.
pub(super) fn assert_num_close(formula: &str, expected: f64, tol: f64) {
    let v = ev(formula);
    match v {
        Value::Number(n) => assert!(
            (n - expected).abs() < tol,
            "{formula} = {n}, expected {expected} ± {tol}"
        ),
        other => panic!("{formula} = {other:?}, expected ~{expected}"),
    }
}
