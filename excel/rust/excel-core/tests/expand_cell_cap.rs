//! 动态数组的**格数闸门**：`EXPAND` / `CHOOSEROWS` / `CHOOSECOLS` 三个漏网。
//!
//! 这三个的共同点是**输出尺寸不受输入数组尺寸约束** —— 输入侧走 `arg_to_2d`，
//! 那里已经有 `checked_array_len`，所以 UNIQUE / SORT / FILTER / TOROW / TOCOL
//! 这类「输出 ≤ 输入」的函数天然封顶；但 EXPAND 的目标行列是两个裸标量实参，
//! CHOOSEROWS/CHOOSECOLS 的 pick 可以重复任意多次，二者都能造出比输入大得多的
//! 结果。缺闸门时最坏不是「算错」，是 `Vec::with_capacity` 直接 panic
//! （capacity overflow），在 WASM 里没有 unwinding，等于一条公式打死 worker。
//!
//! 口径：复用 `eval.rs` 的 `checked_array_len` / `DYNAMIC_ARRAY_CELL_CAP`，
//! 超限一律 `#VALUE!`，与 `SEQUENCE` 完全一致。
//!
//! **不在这里钉「超网格该给 `#NUM!` 还是 `#VALUE!`」**：那是 `eval.rs` 的
//! `DYNAMIC_ARRAY_CELL_CAP` 注释里登记的已知未决分歧（TS 参考引擎对
//! 行 > 1048576 / 列 > 16384 给 `#NUM!`，本引擎只数格数给 `#VALUE!`），
//! owner 待定。本文件只断言「有闸门、且是 SEQUENCE 的那个码」。
//!
//! 测试规模是**刻意压到刚过上限**的：闸门被人删掉时这些用例要退化成
//! 「建出 ~1e6 格数组」（约 25 MB，跑得完、看得见红），而不是把跑测试的机器
//! 拖死 —— 后者会让下一个人以为是环境问题而不是回归。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

/// 上限本身：`DYNAMIC_ARRAY_CELL_CAP == 1_048_576`。
const CAP: u32 = 1_048_576;

/// 把数组喂给 `SUM` 折成标量，避免真的往表里溢出上百万格。
///
/// `SUM` 是这里唯一合用的探针：`COUNTA` 会把**错误值本身**当成一个非空值数成
/// `1`，闸门有没有生效它都回 `1`（踩过一次）；`SUM` 对错误实参是传播，对数组
/// 是逐格求和，两种结局区分得开。
fn sum_of(sheet: &mut Sheet, addr: &str, inner: &str) -> Value {
    let src = format!("=SUM({inner})");
    assert!(sheet.set_formula(addr, &src));
    sheet.get_cell(addr)
}

/// 溢出锚点持有整个 `Value::Array`（WASM 边界才折成左上角），所以锚点格要单取
/// 左上角，其余格直接读 —— 与 `wrap_rows_cols.rs` 的读法一致。
fn anchor(sheet: &Sheet, addr: &str) -> Value {
    match sheet.get_cell(addr) {
        Value::Array(a) => a.get(0, 0).cloned().unwrap_or(Value::Null),
        other => other,
    }
}

// === EXPAND ===

/// 修复前这条**不返回错误值，而是 panic**：`new_rows as usize * new_cols as usize`
/// = 4294967295² ≈ 1.8e19，`Vec::with_capacity` 算 `1.8e19 × size_of::<Value>()`
/// （24 B）时 usize 溢出 → `capacity overflow`。WASM 没有 unwinding，那就是
/// 一条公式打死 worker。
///
/// `4294967295` 是 `u32::MAX`：`n.trunc() as u32` 是饱和转换，任何更大的数字
/// 字面量都落到同一个值，所以这条就是该路径的最坏情形。
#[test]
fn expand_absurd_shape_is_an_error_not_a_panic() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=EXPAND(1,4294967295,4294967295,0)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::InvalidValue));
}

/// 上限的两侧各一格，证明闸门钉在 `> CAP` 而不是别的地方。
/// `=EXPAND(1,1048576,1,0)` 正好 1,048,576 格，源是标量 `1`、其余补 `0`，
/// 所以 `SUM` 必须是 `1`。
#[test]
fn expand_cap_boundary_is_exactly_the_shared_constant() {
    let mut sheet = Sheet::new();
    assert_eq!(
        sum_of(&mut sheet, "A1", &format!("EXPAND(1,{CAP},1,0)")),
        Value::Number(1.0),
        "正好 CAP 格必须放行"
    );
    assert_eq!(
        sum_of(&mut sheet, "A2", &format!("EXPAND(1,{},1,0)", CAP + 1)),
        Value::Error(ValueError::InvalidValue),
        "CAP + 1 格必须 #VALUE!"
    );
}

/// 与 `SEQUENCE` 同码：这是「复用同一个闸门」的证据，不是巧合。
#[test]
fn expand_over_cap_matches_the_sequence_verdict() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({})", CAP + 1)));
    assert!(sheet.set_formula("A2", &format!("=EXPAND(1,{},1,0)", CAP + 1)));
    let seq = sheet.get_cell("A1");
    assert_eq!(seq, Value::Error(ValueError::InvalidValue));
    assert_eq!(
        sheet.get_cell("A2"),
        seq,
        "EXPAND 必须与 SEQUENCE 给同一个码"
    );
}

/// 两个轴各自都在网格内、只有**乘积**越界的情形（`2000 × 2000 = 4e6`）。
/// 这条走的是纯格数分支，与「超网格」那条未决分歧无关。
#[test]
fn expand_over_cap_by_product_only() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=EXPAND(1,2000,2000,0)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::InvalidValue));
}

/// 闸门不能误伤正常用法：EXPAND 的既有语义一个字都没变。
#[test]
fn ordinary_expand_is_unaffected() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A2", Value::Number(2.0));
    assert!(sheet.set_formula("C1", "=EXPAND(A1:A2,4,2,99)"));
    assert_eq!(anchor(&sheet, "C1"), Value::Number(1.0));
    assert_eq!(sheet.get_cell("D1"), Value::Number(99.0));
    assert_eq!(sheet.get_cell("C2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("C4"), Value::Number(99.0));
    assert!(sheet.set_formula("F1", "=EXPAND(A1:A2,3)"));
    assert_eq!(sheet.get_cell("F3"), Value::Error(ValueError::NotAvailable));
}

// === CHOOSEROWS / CHOOSECOLS ===

/// 输入是**一整行**（1×16384，正好在 `arg_to_2d` 的上限之内），每个 pick 复制
/// 一整行；65 个 pick = 1,064,960 格 > CAP。修复前这里会老老实实建出来。
#[test]
fn chooserows_repeated_picks_hit_the_cap() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("XFD1", Value::Number(2.0));
    let picks = ",1".repeat(65);
    assert_eq!(
        sum_of(&mut sheet, "A3", &format!("CHOOSEROWS(A1:XFD1{picks})")),
        Value::Error(ValueError::InvalidValue)
    );
}

/// 列方向对称：输入 16384×1，65 个 pick = 1,064,960 格 > CAP。
#[test]
fn choosecols_repeated_picks_hit_the_cap() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A16384", Value::Number(2.0));
    let picks = ",1".repeat(65);
    assert_eq!(
        sum_of(&mut sheet, "C1", &format!("CHOOSECOLS(A1:A16384{picks})")),
        Value::Error(ValueError::InvalidValue)
    );
}

/// 正常用法不受影响，且重复 pick 本身仍然合法（闸门只看总格数）。
#[test]
fn ordinary_choose_rows_cols_are_unaffected() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("A2", Value::Number(3.0));
    sheet.set_cell("B2", Value::Number(4.0));

    assert!(sheet.set_formula("D1", "=CHOOSEROWS(A1:B2,2,1,1)"));
    assert_eq!(anchor(&sheet, "D1"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("E1"), Value::Number(4.0));
    assert_eq!(sheet.get_cell("D3"), Value::Number(1.0));

    assert!(sheet.set_formula("D6", "=CHOOSECOLS(A1:B2,2,2)"));
    assert_eq!(anchor(&sheet, "D6"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("E6"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("D7"), Value::Number(4.0));
}
