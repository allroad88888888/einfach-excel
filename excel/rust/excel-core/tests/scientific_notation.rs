//! 科学计数字面量的词法：`=1E2` 是 `100`，不是「`1` 后面跟着单元格 `E2`」。
//!
//! # 这条为什么单独成一份
//!
//! `E2` **既是**合法的指数部分、**也是**合法的单元格引用（E 列第 2 行）。词法
//! 层怎么切，决定了下面四条互相牵制的答案：
//!
//! | 写法        | 答案                       |
//! | ----------- | -------------------------- |
//! | `=1E2`      | `100`（`E2` 被吞进指数）   |
//! | `=1+E2`     | `1` 加 E2 格的值           |
//! | `=A1*E2`    | 两个引用相乘               |
//! | `=1E2+E2`   | `100` 加 E2 格的值         |
//!
//! 一条只测 `=1E2` 的套件配上「见到 `E` 就一路吞到底」的实现照样全绿，而
//! `=1+E2` 会从「读 E2 格」变成语法错误。所以本文件每一组都成对写：**吞** 的
//! 那一半，和 **不吞** 的那一半。
//!
//! # 消歧规则（照 TS 参考实现 `excel/excel-core-ts/src/parser/tokenizer.ts`
//! 的 `readNumber`）
//!
//! 数字字面量读完尾数（数字与 `.`）后，**只有**满足以下形状才把指数吞进来：
//!
//! ```text
//! [eE] [+-]? digit+          // 至少一位指数数字
//! ```
//!
//! 三个推论，全部由下面的用例钉住：
//!
//! 1. **贪婪**：只要形状满足就吞，不回头看「`E2` 是不是也能当引用」。所以
//!    `=1E2` 是 `100`，`=1E2E2` 是 `100` 后面跟了个 `E2` —— 尾巴无处安放，
//!    整式 `#VALUE!`。
//! 2. **零位指数数字就不吞**：`=1E` / `=1E+` / `=1E-` 里的 `E` 退回成标识符，
//!    整式 `#VALUE!`（`1` 与 `E` 之间没有运算符）。
//! 3. **`$` 不是指数符号**：`=1E$2` 的 `E$2` 是引用不是指数，于是变成
//!    「`1` 紧挨着一个引用」→ `#VALUE!`。
//!
//! 另外两条边界：
//!
//! - **不认十六进制/八进制等前缀** —— Excel 公式里没有这种字面量。`=0x10` 在
//!   两个引擎上都是 `#VALUE!`（`0` 后面跟着单元格 `X10`）。
//! - **非有限的字面量不成立** —— `=2E308` 溢出成 `inf`。TS 侧 `readNumber` 的
//!   `Number.isFinite` 闸门把它判成词法错误（`#VALUE!`）；Rust 的
//!   `str::parse::<f64>` 反而**成功**返回 `inf`，所以这一侧必须自己补闸门，
//!   否则修完词法会新造出一个「单元格显示 `Infinity`」的分歧。
//!
//! # 依据
//!
//! - TS 参考引擎（`excel/excel-core-ts`）实测：`=1E2` → `100`、`=1E` →
//!   `#VALUE!`、`=1E2:E5` → `#VALUE!`、`=0x10` → `#VALUE!`、`=2E308` →
//!   `#VALUE!`。**能解析成功**的那一半另有跨引擎钉子
//!   `excel/solid-excel/test/cross-engine-parity-scientific.ts`；解析失败的
//!   那一半按构造进不了 bulk 导入表（驱动断言 `rejectedFormulas === 0`），
//!   只住在本文件。
//! - Microsoft，"Excel specifications and limits"：公式可用的最大正数是
//!   `1.7976931348623158e+308`，即 `f64::MAX` 本身允许、越过才不成立 ——
//!   与上面那条 `is_finite` 闸门同一个判据。
//!
//! # 往返（parse → render）
//!
//! 插删行列会把公式**重新渲染**一遍，所以这条改动的回归面包含
//! `render_formula`。渲染器不保留字面量的书写形式（`=1.50` 今天也渲染成
//! `=1.5`），`Expr::Number` 里只有一个 `f64`；所以 `=1E2` 往返后是 `=100`。
//! 本文件钉的是**语义**往返：往返前后求值相同，且再往返一次不再变（幂等）。

use einfach_excel_core::{parse_formula, render_formula, value_to_display, CellAddress, Workbook};

/// 在空表上算一条公式，返回它的显示串。
fn eval(formula: &str) -> String {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", formula);
    value_to_display(&wb.get_cell("Sheet1", "A1"))
}

/// 在 `E2 = 7`、`E5 = 9` 的表上算一条公式 —— 用来区分「`E2` 被吞进指数」与
/// 「`E2` 读的是格子」：两种切法给的数不同，答案本身就是证据。
fn eval_with_e_column(formula: &str) -> String {
    let mut wb = Workbook::new();
    wb.set_formula(0, "E2", "=7");
    wb.set_formula(0, "E5", "=9");
    wb.set_formula(0, "A1", "=3");
    wb.set_formula(0, "B1", formula);
    value_to_display(&wb.get_cell("Sheet1", "B1"))
}

// ===================== 吞：`E<digits>` 是指数 =============================

#[test]
fn plain_scientific_literal_is_a_number() {
    assert_eq!(eval("=1E2"), "100");
}

#[test]
fn exponent_marker_is_case_insensitive() {
    // 小写 `e` 与大写 `E` 是同一个记号 —— Excel 与 TS 侧都不区分。
    assert_eq!(eval("=1e2"), "100");
}

#[test]
fn exponent_accepts_an_explicit_sign() {
    assert_eq!(eval("=1E+2"), "100");
    assert_eq!(eval("=1E-2"), "0.01");
}

#[test]
fn mantissa_may_be_fractional() {
    assert_eq!(eval("=1.5E3"), "1500");
    // 尾数可以省掉整数部分（`.5`）或小数部分（`1.`）—— 两种都由既有的
    // 「数字与 `.` 一路吃」尾数扫描接住，指数后缀跟在它后面。
    assert_eq!(eval("=.5E2"), "50");
    assert_eq!(eval("=1.E2"), "100");
}

#[test]
fn zero_exponent_is_identity() {
    assert_eq!(eval("=1E0"), "1");
}

#[test]
fn scientific_literal_composes_with_the_percent_postfix() {
    // `%` 是后缀一元运算符，作用在整个字面量上：`1E2%` = 100% = 1。
    assert_eq!(eval("=1E2%"), "1");
}

#[test]
fn scientific_literal_works_as_a_function_argument() {
    assert_eq!(eval("=SUM(1E2,1)"), "101");
}

#[test]
fn upper_bound_literal_is_allowed() {
    // MS 明写公式可用的最大正数是 1.7976931348623158e+308，闸门不能提前一格。
    assert_eq!(eval("=1E308"), "1E+308");
}

// ===================== 不吞：`E2` 还是单元格引用 ===========================

#[test]
fn a_reference_after_an_operator_stays_a_reference() {
    // 这条是「贪婪」的对照组：`1` 与 `E2` 之间隔着 `+`，指数吞不到它。
    assert_eq!(eval_with_e_column("=1+E2"), "8");
}

#[test]
fn a_reference_after_another_reference_stays_a_reference() {
    assert_eq!(eval_with_e_column("=A1*E2"), "21");
}

#[test]
fn a_scientific_literal_and_a_reference_can_coexist() {
    // 同一条式子里两个 `E2`：前一个被吞进指数，后一个是格子。
    assert_eq!(eval_with_e_column("=1E2+E2"), "107");
}

#[test]
fn a_bare_reference_is_untouched() {
    assert_eq!(eval_with_e_column("=E2"), "7");
    assert_eq!(eval_with_e_column("=SUM(E2:E5)"), "16");
}

// ===================== 边界：吞不下去的形状 ===============================

#[test]
fn an_exponent_marker_without_digits_is_not_consumed() {
    // `E` 退回成标识符，`1` 与它之间没有运算符 → 整式解析失败。
    assert_eq!(eval("=1E"), "#VALUE!");
    assert_eq!(eval("=1E+"), "#VALUE!");
    assert_eq!(eval("=1E-"), "#VALUE!");
    // `EE2` 是 EE 列第 2 行的引用；第一个 `E` 后面没有数字，指数吞不动。
    assert_eq!(eval("=1EE2"), "#VALUE!");
}

#[test]
fn a_dollar_sign_is_not_an_exponent_sign() {
    // `E$2` 是行绝对引用，不是「指数 +2」。吞不到 → `1` 紧挨着一个引用。
    assert_eq!(eval("=1E$2"), "#VALUE!");
}

#[test]
fn greedy_consumption_leaves_a_dangling_tail() {
    // `1E2E2` = `100` 后面跟着 `E2`，两者之间没有运算符 → `#VALUE!`。
    // 这是「贪婪」的直接后果：词法层不会为了让整式说得通而少吞。
    assert_eq!(eval("=1E2E2"), "#VALUE!");
    // `1E2.5` 同理：`100` 后面跟着 `.5`。
    assert_eq!(eval("=1E2.5"), "#VALUE!");
}

#[test]
fn a_colon_after_a_scientific_literal_is_not_a_range() {
    // 提问里的那条：`=1E2:E5` 是区间还是「100 后面跟垃圾」？——**垃圾**。
    // `1E2` 已经是个数，冒号的左端不是引用，构不成区间。
    assert_eq!(eval_with_e_column("=1E2:E5"), "#VALUE!");
    assert_eq!(eval_with_e_column("=SUM(1E2:E5)"), "#VALUE!");
    // 对照：真正的区间不受影响（上面 `a_bare_reference_is_untouched` 已钉
    // `SUM(E2:E5)`），整行区间 `2:2` 这条更早的消歧路径 —— 它同样从一个数字
    // 开头 —— 也不能被指数扫描抢走。
    assert_eq!(eval_with_e_column("=SUM(2:2)"), "7");
}

#[test]
fn no_hex_or_other_radix_prefixes() {
    // Excel 公式里没有 `0x` 字面量。`0x10` 是「`0` 后面跟着单元格 `X10`」，
    // 两个记号之间没有运算符 → `#VALUE!`。别顺手加进来。
    assert_eq!(eval("=0x10"), "#VALUE!");
    assert_eq!(eval("=0b101"), "#VALUE!");
}

#[test]
fn a_non_finite_literal_does_not_parse() {
    // `2E308` 溢出成 `inf`。Rust 的 `parse::<f64>()` 对它返回 `Ok(inf)`，
    // 所以词法层必须自己补 `is_finite` 闸门 —— 否则单元格会显示 `Infinity`，
    // 那是两个引擎都给不出的答案。TS 侧同一条闸门写在 `readNumber` 里。
    assert_eq!(eval("=2E308"), "#VALUE!");
    assert_eq!(eval("=1E309"), "#VALUE!");
    // 闸门管的是**字面量**，不是运算结果：不带指数的超长整数同样越界。
    let huge = format!("={}", "9".repeat(320));
    assert_eq!(eval(&huge), "#VALUE!");
    // 下溢方向相反 —— 太小的字面量收敛到 0，是有限值，必须**不**报错。
    assert_eq!(eval("=1E-400"), "0");
}

// ===================== 往返（parse → render）=============================

#[test]
fn round_trip_is_value_preserving_and_idempotent() {
    // 渲染器不保留书写形式（`Expr::Number` 只有一个 f64），所以 `=1E2` 渲染
    // 成 `=100`。要钉的是：往返不改变求值，且第二次往返不再变。
    for (src, rendered) in [
        ("=1E2", "=100"),
        ("=1e2", "=100"),
        ("=1E+2", "=100"),
        ("=1.5E3", "=1500"),
        ("=1E2+E2", "=(100+E2)"),
        ("=SUM(1E2,1)", "=SUM(100,1)"),
        ("=1E2%", "=100%"),
    ] {
        let expr = parse_formula(src).unwrap_or_else(|| panic!("{src} must parse"));
        let once = render_formula(&expr);
        assert_eq!(once, rendered, "{src} renders to {rendered}");
        let reparsed = parse_formula(&once).unwrap_or_else(|| panic!("{once} must re-parse"));
        assert_eq!(reparsed, expr, "{src}: re-parsing the rendered text must give the same AST");
        assert_eq!(render_formula(&reparsed), once, "{src}: rendering must be idempotent");
    }
}

#[test]
fn round_trip_survives_the_extremes() {
    // 大/小指数走 `render_into` 的非整数分支（`{}` 对 f64 是十进制展开，不带
    // 指数），文本会很长；要紧的是它**再解析回同一个 f64**，否则一次插行就把
    // 用户的数改了。
    for src in ["=1E308", "=1E-300", "=1.7976931348623157E308"] {
        let expr = parse_formula(src).unwrap_or_else(|| panic!("{src} must parse"));
        let rendered = render_formula(&expr);
        let reparsed = parse_formula(&rendered).unwrap_or_else(|| panic!("{rendered} re-parses"));
        assert_eq!(reparsed, expr, "{src} → {rendered} must round-trip bit-exactly");
    }
}

#[test]
fn structural_edits_keep_the_value_and_move_only_the_reference() {
    // 插行会把公式重新渲染一遍 —— 这是往返在产品里的真实入口。
    let mut wb = Workbook::new();
    wb.set_formula(0, "E2", "=7");
    wb.set_formula(0, "B1", "=1E2+E2");
    assert_eq!(value_to_display(&wb.get_cell("Sheet1", "B1")), "107");

    wb.insert_rows(0, 1, 1); // 在第 2 行前插一行：E2 → E3
    let text = wb
        .sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse("B1").unwrap())
        .expect("B1 keeps a formula");
    assert_eq!(text, "=(100+E3)", "字面量的值不变，只有引用跟着移");
    assert_eq!(value_to_display(&wb.get_cell("Sheet1", "B1")), "107");
}
