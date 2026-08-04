//! 公式文本里**数字字面量的写法**：`shift::render_formula` 什么时候退到科学计数。
//!
//! 背景：`Expr::Number` 只存一个 `f64`，渲染器从不保留字面量的书写形式
//! （`=1.50` 一直渲染成 `=1.5`，`=1E2` 渲染成 `=100`）。这本身可接受。不可接受
//! 的是 Rust 的 `Display for f64` **从不**用科学计数：`=1E-300` 会被摊成 302 个
//! 字符的十进制串。值没变，但结构性编辑（插删行列）会把**所有**受影响的公式
//! 重渲染一遍，于是一次插行就能把 8 字符的公式变成 302 字符。
//!
//! # 口径
//!
//! 只挑写法，**一位数字都不改**：`{}` 与 `{:e}` 都是 f64 的最短往返表示，
//! 二选一而已。阈值是「普通写法（不含符号）超过 20 字符就退到科学计数」，
//! `20 = 2 ("0.") + 17 (最短往返的有效数字上限)` —— 推导写在
//! `shift/render_number.rs` 的 `MAX_PLAIN_LITERAL_LEN` 上。
//!
//! **没有复用 `general_text::excel_general_to_text`**（Excel General 显示规格）：
//! 它只保留 15 位有效数字，用来渲染源码就是每次插行都改用户的数。
//! 完整理由与 Apache POI 的依据写在 `shift/render_number.rs::render_number` 的文档注释里；
//! 本文件用 `general_text_would_lose_digits_here` 那条把「为什么不能复用」变成
//! 一条可执行的证据。

use einfach_excel_core::{
    excel_general_to_text, parse_formula, render_formula, value_to_display, CellAddress, Expr,
    Workbook,
};

/// 解析 → 渲染，回渲染出来的公式文本。
fn render(src: &str) -> String {
    let expr = parse_formula(src).unwrap_or_else(|| panic!("{src} must parse"));
    render_formula(&expr)
}

/// 渲染出来的文本必须能被自己的解析器读回**同一个 f64**（位相同）。
fn assert_round_trips(src: &str) -> String {
    let expr = parse_formula(src).unwrap_or_else(|| panic!("{src} must parse"));
    let rendered = render_formula(&expr);
    let reparsed = parse_formula(&rendered).unwrap_or_else(|| panic!("{rendered} must re-parse"));
    assert_eq!(reparsed, expr, "{src} → {rendered} 必须位级往返");
    // 幂等：再渲染一次不再变。
    assert_eq!(render_formula(&reparsed), rendered, "{src}: 渲染必须幂等");
    rendered
}

/// 取出一条只含数字字面量的公式的 f64，用来做位级比较。
fn number_of(src: &str) -> f64 {
    match parse_formula(src) {
        Some(Expr::Number(n)) => n,
        other => panic!("{src} 不是裸数字字面量：{other:?}"),
    }
}

// === 回归面最大的一条：普通数字一个字符都没变 ===

/// 这条是本次改动的**回归护栏**：结构性编辑会重渲染所有受影响的公式，所以
/// 「日常数字的渲染是否逐字节不变」比新行为本身更要紧。
///
/// 覆盖：整数分支、小数、负数、17 位有效数字（最短往返的上限）、以及
/// 阈值内侧的两个极端（`1E19` / `1E-18` 正好 20 字符）。
#[test]
fn ordinary_numbers_render_exactly_as_before() {
    for (src, expected) in [
        ("=1.5", "=1.5"),
        ("=100", "=100"),
        ("=0.001", "=0.001"),
        ("=0", "=0"),
        ("=1.50", "=1.5"),
        ("=1E2", "=100"),
        ("=123456789", "=123456789"),
        ("=0.1", "=0.1"),
        ("=3.14159265358979", "=3.14159265358979"),
        // 17 位有效数字：最短往返表示的上限，普通写法 19 字符，仍在阈值内。
        ("=0.30000000000000004", "=0.30000000000000004"),
        ("=1.0000000000000002", "=1.0000000000000002"),
        // 阈值内侧：普通写法正好 20 字符。
        ("=1E19", "=10000000000000000000"),
        ("=1E-18", "=0.000000000000000001"),
        // 负号不占预算（阈值量的是数字本身，不是符号），所以 `-1E-18` 与
        // `1E-18` 写法一致，不出现「同一个数正负两种写法」。
        ("=-1E-18", "=-0.000000000000000001"),
    ] {
        assert_eq!(render(src), expected, "{src}");
    }
}

// === 新行为：阈值外侧退到科学计数 ===

/// `=1E-300` 是这次的起因：修复前 302 字符，修复后 8 字符。
#[test]
fn tiny_magnitudes_use_scientific_notation() {
    assert_eq!(render("=1E-300"), "=1E-300");
    assert_eq!(render("=1e-300"), "=1E-300", "大小写在 AST 里已经不存在");
    // 阈值外侧的第一格：21 字符。
    assert_eq!(render("=1E-19"), "=1E-19");
}

/// 大数方向同理。注意 `1E19` 留在普通写法、`1E20` 才退 —— 与 Excel General
/// 的切换点一致（那边的依据是 20 字符缓冲宽度，这边是 `2 + 17` 的推导，
/// 数值相同属于同源不同证）。
#[test]
fn huge_magnitudes_use_scientific_notation() {
    assert_eq!(render("=1E20"), "=1E20");
    assert_eq!(render("=1E308"), "=1E308");
    assert_eq!(render("=1.7976931348623157E308"), "=1.7976931348623157E308");
}

/// 次正规数（`5E-324` 是最小的正 f64）：普通写法 325 字符。
#[test]
fn subnormal_uses_scientific_notation() {
    assert_eq!(render("=5E-324"), "=5E-324");
}

// === 往返（本任务的硬要求）===

/// 渲染结果必须能被**自己的解析器**读回同一个 f64，且再渲染一次不变。
/// 极值三条（`1E308` / `1E-300` / `5E-324` 次正规）按要求逐条覆盖。
#[test]
fn every_literal_round_trips_bit_exactly() {
    for src in [
        "=1.5",
        "=100",
        "=0.001",
        "=0",
        "=1E2",
        "=0.30000000000000004",
        "=1.0000000000000002",
        "=1E19",
        "=1E20",
        "=1E-18",
        "=1E-19",
        "=1E308",
        "=1.7976931348623157E308",
        "=1E-300",
        "=5E-324",
        "=-1E-300",
        "=2.2250738585072014E-308",
        "=SUM(1E-300,1E308)",
        "=1E-300+A1",
    ] {
        assert_round_trips(src);
    }
}

/// 往返在**产品里**的真实入口：插行会把公式重渲染并写回公式源表。
/// 修复前这里存回去的是一条 302 字符的公式。
#[test]
fn structural_edit_keeps_the_literal_short_and_exact() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "E2", "=7");
    wb.set_formula(0, "B1", "=1E-300+E2");
    assert_eq!(value_to_display(&wb.get_cell("Sheet1", "B1")), "7");

    wb.insert_rows(0, 1, 1); // 在第 2 行前插一行：E2 → E3
    let text = wb
        .sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse("B1").unwrap())
        .expect("B1 keeps a formula");
    assert_eq!(text, "=(1E-300+E3)", "字面量不该被摊成 302 字符");
    assert_eq!(value_to_display(&wb.get_cell("Sheet1", "B1")), "7");

    // 再插一次：写回去的文本必须能原样再走一轮（幂等 + 不漂移）。
    wb.insert_rows(0, 1, 1);
    let text = wb
        .sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse("B1").unwrap())
        .expect("B1 keeps a formula");
    assert_eq!(text, "=(1E-300+E4)");
}

// === 为什么不能复用 General 的转文本规格 ===

/// 把「不复用」变成一条可执行的证据：`excel_general_to_text` 只保留 15 位有效
/// 数字，用它渲染源码，一次结构性编辑就能把用户的数**改掉**。
///
/// 这不是假想值：`=0.1+0.2` 的结果字面量就长这样，用户把它粘成常量很常见。
#[test]
fn general_text_would_lose_digits_here() {
    for src in ["=0.30000000000000004", "=1.0000000000000002"] {
        let original = number_of(src);
        let general = excel_general_to_text(original);
        let via_general: f64 = general.parse().expect("General 的输出仍是个数");
        assert_ne!(
            via_general.to_bits(),
            original.to_bits(),
            "{src}: General 规格读回来已经不是同一个 f64（{general}）—— 这正是不能复用它的理由"
        );
        // 而现行渲染器是位级往返的。
        let rendered = assert_round_trips(src);
        assert_eq!(
            rendered
                .trim_start_matches('=')
                .parse::<f64>()
                .unwrap()
                .to_bits(),
            original.to_bits()
        );
    }
}
