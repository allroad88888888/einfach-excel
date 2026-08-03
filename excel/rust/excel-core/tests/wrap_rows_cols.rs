//! `WRAPROWS` / `WRAPCOLS` —— Excel 365 动态数组批次里最后补上的两个。
//!
//! 语义依据全部抄在 `src/eval_wrap.rs` 的模块注释里（微软 support 的
//! "WRAPROWS function" / "WRAPCOLS function" 两页）。这份只做断言。
//!
//! 这一对**极容易搞反**，所以第一组测试是一个手算例子：同一个 6 元素向量、
//! 同一个 `wrap_count = 2`，WRAPROWS 给 3 行 × 2 列、WRAPCOLS 给 2 行 × 3 列。
//! 一个把方向写反的实现在「形状对不对」这种单侧断言上照样能全绿 —— 必须两个
//! 函数吃同一份输入、断言两个不同的矩形，才分得开。
//!
//! 走 `Sheet::set_formula` 而不是内部求值入口：这两个是数组构造器，
//! `sheet.rs` 的 `ARRAY_FUNCTION_NAMES` 静态闸门漏了它们的话，公式照样算得对
//! 但**不会溢出**，只有端到端才看得见。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

/// 在 A1:A`n` 铺 1..=n 的列向量。
fn seed_column(sheet: &mut Sheet, n: u32) {
    for i in 1..=n {
        sheet.set_cell(&format!("A{i}"), Value::Number(f64::from(i)));
    }
}

/// 锚点的数组形状。
fn shape_at(sheet: &Sheet, addr: &str) -> (u32, u32) {
    match sheet.get_cell(addr) {
        Value::Array(a) => a.shape(),
        other => panic!("{addr} 不是数组：{other:?}"),
    }
}

/// 从锚点起 `rows`×`cols` 的矩形按行主序读回。
///
/// 锚点格本身持有整个 `Value::Array`（WASM 边界才折成左上角标量），所以 (0,0)
/// 单取它的左上角，其余走溢出格的派生 atom —— 这样读到的确实是溢出结果，而不是
/// 把锚点数组直接索引一遍。
fn rect(sheet: &Sheet, col0: char, rows: u32, cols: u32) -> Vec<String> {
    let mut out = Vec::new();
    for r in 0..rows {
        for c in 0..cols {
            let col = char::from(u8::try_from(u32::from(col0 as u8) + c).unwrap());
            let cell = sheet.get_cell(&format!("{col}{}", r + 1));
            let cell = match (r, c, &cell) {
                (0, 0, Value::Array(a)) => a.get(0, 0).cloned().unwrap_or(Value::Null),
                _ => cell,
            };
            out.push(format!("{cell:?}"));
        }
    }
    out
}

fn nums(list: &[f64]) -> Vec<String> {
    list.iter().map(|n| format!("{:?}", Value::Number(*n))).collect()
}

// === 方向 —— 手算例子 ===

/// `{1;2;3;4;5;6}` + `wrap_count = 2`：
///
/// ```text
/// =WRAPROWS(A1:A6,2)      =WRAPCOLS(A1:A6,2)
///   1 2                     1 3 5
///   3 4                     2 4 6
///   5 6
/// ```
///
/// 两个断言必须同表：只测其中一个，方向写反的实现能靠「形状是 3×2」蒙混过去。
#[test]
fn wrap_direction_hand_worked_example() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 6);

    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A6,2)"));
    assert_eq!(shape_at(&sheet, "C1"), (3, 2), "WRAPROWS 每行 2 个 → 3 行 2 列");
    assert_eq!(rect(&sheet, 'C', 3, 2), nums(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]));

    assert!(sheet.set_formula("G1", "=WRAPCOLS(A1:A6,2)"));
    assert_eq!(shape_at(&sheet, "G1"), (2, 3), "WRAPCOLS 每列 2 个 → 2 行 3 列");
    assert_eq!(rect(&sheet, 'G', 2, 3), nums(&[1.0, 3.0, 5.0, 2.0, 4.0, 6.0]));
}

/// 微软文档自己的例子：7 个元素、`wrap_count = 3`，第三行是 `G, #N/A, #N/A`。
/// 行向量（1×n）与列向量（n×1）走的是同一条读序，这里顺带把行向量那一路钉住。
#[test]
fn wraprows_matches_microsoft_documented_example() {
    let mut sheet = Sheet::new();
    for (i, ch) in ["A", "B", "C", "D", "E", "F", "G"].iter().enumerate() {
        let col = char::from(b'A' + u8::try_from(i).unwrap());
        sheet.set_cell(&format!("{col}1"), Value::Text((*ch).into()));
    }
    assert!(sheet.set_formula("A3", "=WRAPROWS(A1:G1,3)"));
    assert_eq!(shape_at(&sheet, "A3"), (3, 3));
    assert_eq!(sheet.get_cell("C4"), Value::Text("F".into()));
    assert_eq!(sheet.get_cell("A5"), Value::Text("G".into()));
    assert_eq!(sheet.get_cell("B5"), Value::Error(ValueError::NotAvailable));
    assert_eq!(sheet.get_cell("C5"), Value::Error(ValueError::NotAvailable));
}

// === pad_with ===

/// 缺省补 `#N/A`（"The value with which to pad. The default is #N/A."）。
/// 两个函数各补一格，且补的位置不同 —— WRAPROWS 补在末行右端、WRAPCOLS 补在
/// 末列下端。
#[test]
fn missing_elements_pad_with_na_by_default() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 5);

    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A5,2)"));
    assert_eq!(shape_at(&sheet, "C1"), (3, 2));
    assert_eq!(sheet.get_cell("C3"), Value::Number(5.0));
    assert_eq!(sheet.get_cell("D3"), Value::Error(ValueError::NotAvailable));

    assert!(sheet.set_formula("G1", "=WRAPCOLS(A1:A5,2)"));
    assert_eq!(shape_at(&sheet, "G1"), (2, 3));
    assert_eq!(sheet.get_cell("I1"), Value::Number(5.0));
    assert_eq!(sheet.get_cell("I2"), Value::Error(ValueError::NotAvailable));
}

/// 给了 `pad_with` 就用它。
#[test]
fn explicit_pad_replaces_the_na_default() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 5);

    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A5,2,\"x\")"));
    assert_eq!(sheet.get_cell("D3"), Value::Text("x".into()));

    assert!(sheet.set_formula("G1", "=WRAPCOLS(A1:A5,2,\"x\")"));
    assert_eq!(sheet.get_cell("I2"), Value::Text("x".into()));
}

/// `pad_with` 求值成错误值是**合法**的 —— 缺省值本身就是 `#N/A`，所以第三个
/// 实参不参与错误短路。这条与下面 `vector` / `wrap_count` 的传播方向相反，
/// 必须成对钉。
#[test]
fn errored_pad_is_a_value_not_a_propagation() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);
    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A3,2,1/0)"));
    assert_eq!(shape_at(&sheet, "C1"), (2, 2));
    assert_eq!(sheet.get_cell("C2"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("D2"), Value::Error(ValueError::DivisionByZero));
}

/// 但 `pad_with` 不能是数组：逐格塞进去会造出嵌套数组，spill / 渲染都接不住。
#[test]
fn array_pad_is_rejected() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);
    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A3,2,SEQUENCE(2))"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::InvalidValue));
    assert!(sheet.set_formula("E1", "=WRAPCOLS(A1:A3,2,SEQUENCE(2))"));
    assert_eq!(sheet.get_cell("E1"), Value::Error(ValueError::InvalidValue));
}

// === wrap_count ===

/// `wrap_count >= 元素个数` → 原样返回单行 / 单列，**不**补齐到 wrap_count 宽。
/// 这条是 `min(wrap_count, len)` 那个夹子的唯一证据：少了它，`=WRAPROWS(v,5)`
/// 会变成 1×5 带两个 `#N/A`。
#[test]
fn oversized_wrap_count_returns_the_vector_unpadded() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);

    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A3,5)"));
    assert_eq!(shape_at(&sheet, "C1"), (1, 3));
    assert_eq!(rect(&sheet, 'C', 1, 3), nums(&[1.0, 2.0, 3.0]));
    assert_eq!(sheet.get_cell("F1"), Value::Null);

    assert!(sheet.set_formula("H1", "=WRAPCOLS(A1:A3,5)"));
    assert_eq!(shape_at(&sheet, "H1"), (3, 1));
    assert_eq!(rect(&sheet, 'H', 3, 1), nums(&[1.0, 2.0, 3.0]));
    assert_eq!(sheet.get_cell("H4"), Value::Null);
}

/// `wrap_count < 1` → `#NUM!`（"#NUM when wrap_count is less than 1"）。
/// 0 / 负数 / 截断后落到 0 的小数三条都走这里。
#[test]
fn wrap_count_below_one_is_num() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 4);
    for (i, src) in [
        "=WRAPROWS(A1:A4,0)",
        "=WRAPCOLS(A1:A4,0)",
        "=WRAPROWS(A1:A4,-1)",
        "=WRAPCOLS(A1:A4,0.9)",
    ]
    .iter()
    .enumerate()
    {
        let addr = format!("C{}", i + 1);
        assert!(sheet.set_formula(&addr, src));
        assert_eq!(sheet.get_cell(&addr), Value::Error(ValueError::Overflow), "{src}");
    }
}

/// 非整数向零截断（文档没写，与 TS 参考引擎的 `Math.trunc` 对齐）：
/// `2.9` 与 `2` 必须给出同一个矩形。
#[test]
fn fractional_wrap_count_truncates() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 6);
    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A6,2.9)"));
    assert_eq!(shape_at(&sheet, "C1"), (3, 2));
    assert_eq!(rect(&sheet, 'C', 3, 2), nums(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]));
}

/// `wrap_count` 转不成数字 → 类型错（渲染边界收成 `#VALUE!`）。
#[test]
fn non_numeric_wrap_count_is_a_type_error() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);
    assert!(sheet.set_formula("C1", "=WRAPROWS(A1:A3,\"x\")"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::WrongType));
}

// === vector ===

/// 二维实参 → `#VALUE!`（"#VALUE when the input isn't one-dimensional"）。
#[test]
fn two_dimensional_vector_is_value_error() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 2);
    sheet.set_cell("B1", Value::Number(7.0));
    sheet.set_cell("B2", Value::Number(8.0));
    assert!(sheet.set_formula("D1", "=WRAPROWS(A1:B2,2)"));
    assert_eq!(sheet.get_cell("D1"), Value::Error(ValueError::InvalidValue));
    assert!(sheet.set_formula("F1", "=WRAPCOLS(A1:B2,2)"));
    assert_eq!(sheet.get_cell("F1"), Value::Error(ValueError::InvalidValue));
}

/// 1×1 的标量算一维，照常折。
#[test]
fn scalar_vector_is_one_dimensional() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("C1", "=WRAPROWS(7,2)"));
    assert_eq!(shape_at(&sheet, "C1"), (1, 1));
    assert_eq!(sheet.get_cell("D1"), Value::Null);
}

/// `vector` / `wrap_count` 求值出错要传播（与上面 pad 那条方向相反）。
#[test]
fn errors_in_vector_or_wrap_count_propagate() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);
    assert!(sheet.set_formula("C1", "=WRAPROWS(1/0,2)"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::DivisionByZero));
    assert!(sheet.set_formula("E1", "=WRAPCOLS(A1:A3,1/0)"));
    assert_eq!(sheet.get_cell("E1"), Value::Error(ValueError::DivisionByZero));
}

// === 形状闸门与元数 ===

/// 结果格数超 `DYNAMIC_ARRAY_CELL_CAP` → `#VALUE!`，与 `SEQUENCE` 同一个闸门
/// 同一个码。`1048576` 个元素按每行 3 个折出来是 349526×3 = 1048578 格。
///
/// 「超网格（列 > 16384）该给 `#NUM!` 还是 `#VALUE!`」是本引擎的已知未决分歧，
/// 说明在 `eval.rs` 的 `DYNAMIC_ARRAY_CELL_CAP` 注释里 —— 这里不新造第二套。
#[test]
fn result_over_the_cell_cap_is_value_error() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("C1", "=WRAPROWS(SEQUENCE(1048576),3)"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::InvalidValue));
}

/// 元数：少于 2 个或多于 3 个实参 → 参数个数错。
#[test]
fn arity_is_two_to_three() {
    let mut sheet = Sheet::new();
    seed_column(&mut sheet, 3);
    for (i, src) in [
        "=WRAPROWS(A1:A3)",
        "=WRAPCOLS(A1:A3)",
        "=WRAPROWS(A1:A3,2,\"x\",9)",
        "=WRAPCOLS(A1:A3,2,\"x\",9)",
    ]
    .iter()
    .enumerate()
    {
        let addr = format!("C{}", i + 1);
        assert!(sheet.set_formula(&addr, src));
        assert_eq!(sheet.get_cell(&addr), Value::Error(ValueError::WrongArgCount), "{src}");
    }
}
