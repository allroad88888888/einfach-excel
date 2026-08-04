//! 实参列表里的**空占位**：`=SUM(1,,2)` / `=SORT(F1:F5,,-1)` 里那个 `,,`。
//!
//! ── 根因在解析层，不在求值器 ──
//!
//! 修之前 `formula/operators.rs::parse_func_arg` 无条件下探 `parse_expr()`。
//! 空槽位在源码里**没有任何 token**，`primary` 拿着 `,` / `)` 找不到分支返回
//! `None`，`parse_func_args` 的 `?` 把**整条公式**拽失败 —— 显示成 `#VALUE!`，
//! 那是「没解析成」的通用码，不是求值器算出来的。所以中枪的不是某几个函数，
//! 而是**任何**写了空占位的公式。
//!
//! 现在空槽位解析成 `Expr::Omitted`，求值成 `Value::Null`（空值）——
//! Excel 的语义是「传了个空值进去」而非「这个参数不存在」，`args.len()` 照常
//! 把空槽算进去，各函数对空值的既有处理照旧生效。这与 TS 引擎的
//! `OmittedExpr`（`excel/excel-core-ts/src/types.ts`，commit da709fd）是同一
//! 条语义。
//!
//! ── 这里钉什么 ──
//!
//! 全部闭式字面量，不写「两个引擎相等」——那样两边一起退回去也是绿的。
//! 跨引擎逐条对照在 `excel/solid-excel/test/cross-engine-parity-omitted-args.test.ts`。
//!
//! 「空占位 ⇒ 取默认值」**只动了四个函数**（`SORT` / `SEQUENCE` 的「必须
//! ≥ 1」校验、`TEXTJOIN` 的 ignore_empty 强转、`XLOOKUP` 的 if_not_found）
//! —— 501 个 `match` 臂里有大量可选参数，但实测下来只有这四处会因为空占位
//! 给出与 Excel 不同的答案。判定口径见 `eval.rs::arg_is_omitted`。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{parse_formula, Expr, Workbook};

/// F1:F5 = 1..5、G1:G5 = 10..50。
fn fixture() -> Workbook {
    let mut wb = Workbook::new();
    {
        let s = wb.sheet_mut(0).unwrap();
        for r in 1..=5u32 {
            s.set_cell(&format!("F{r}"), Value::Number(r as f64));
            s.set_cell(&format!("G{r}"), Value::Number((r * 10) as f64));
        }
    }
    wb
}

fn eval(formula: &str) -> Value {
    let mut wb = fixture();
    wb.set_formula(0, "Z1", formula);
    wb.get_cell("Sheet1", "Z1")
}

/// 会溢出的公式：装在 Z1，把投影出来的块按行读回成 `"a|b ; c|d"`。
fn eval_spill(formula: &str) -> String {
    let mut wb = fixture();
    wb.set_formula(0, "Z1", formula);
    let _ = wb.get_cell("Sheet1", "Z1");
    let mut rows = Vec::new();
    for r in 1..=8u32 {
        let mut row = Vec::new();
        for c in ["Z", "AA", "AB"] {
            match wb.get_cell("Sheet1", &format!("{c}{r}")) {
                Value::Null => row.push(String::new()),
                other => row.push(einfach_excel_core::value_to_display(&other)),
            }
        }
        while row.last().map(|s| s.is_empty()).unwrap_or(false) {
            row.pop();
        }
        if row.is_empty() {
            break;
        }
        rows.push(row.join("|"));
    }
    rows.join(" ; ")
}

fn num(n: f64) -> Value {
    Value::Number(n)
}
fn text(s: &str) -> Value {
    Value::Text(s.to_string())
}

// ── 解析层：空槽位有形状，不是解析失败 ────────────────────────────

#[test]
fn omitted_slot_parses_into_its_own_node() {
    let ast = parse_formula("=XLOOKUP(3,F1:F5,G1:G5,,-1)").expect("must parse");
    let Expr::FuncCall { name, args } = ast else {
        panic!("expected FuncCall, got {ast:?}");
    };
    assert_eq!(name, "XLOOKUP");
    assert_eq!(args.len(), 5);
    assert_eq!(args[3], Expr::Omitted);
}

#[test]
fn trailing_and_leading_omitted_slots_parse() {
    // 末尾空占位。
    let ast = parse_formula("=SUM(1,)").expect("must parse");
    let Expr::FuncCall { args, .. } = ast else {
        panic!("expected FuncCall");
    };
    assert_eq!(args, vec![Expr::Number(1.0), Expr::Omitted]);

    // 首位空占位 + 全空。
    let ast = parse_formula("=SUM(,)").expect("must parse");
    let Expr::FuncCall { args, .. } = ast else {
        panic!("expected FuncCall");
    };
    assert_eq!(args, vec![Expr::Omitted, Expr::Omitted]);

    // 零参数仍然是零参数，不是一个空占位 —— `=NOW()` 不能变成 `NOW(空)`。
    let ast = parse_formula("=NOW()").expect("must parse");
    let Expr::FuncCall { args, .. } = ast else {
        panic!("expected FuncCall");
    };
    assert!(args.is_empty());
}

/// 数组字面量与联合区域**不接受**空槽 —— Excel 那两处也不接受，没顺手放宽。
#[test]
fn array_literal_and_multi_area_still_reject_empty_slots() {
    assert!(parse_formula("={1,,2}").is_none());
    assert!(parse_formula("=AREAS((F1:F5,))").is_none());
    // 真正的语法错误照旧是语法错误。
    assert!(parse_formula("=SUM(1,,").is_none());
    assert!(parse_formula("=(,)").is_none());
}

/// 结构随动对空占位是恒等，渲染成空串 —— 插行之后公式原样回来。
/// 渲染丢掉空槽的话 `=SUM(F1,,F2)` 会被写回成 `=SUM(F2,F3)`，参数错位。
#[test]
fn omitted_slot_survives_a_structural_edit() {
    let mut wb = fixture();
    wb.set_formula(0, "Z1", "=SUM(F1,,F2)");
    wb.sheet_mut(0).unwrap().insert_row(0, 1);
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("Z2").as_deref(),
        Some("=SUM(F2,,F3)")
    );
}

// ── 求值：空占位就是一个空值 ──────────────────────────────────────

#[test]
fn omitted_arg_evaluates_as_blank_in_aggregates() {
    assert_eq!(eval("=SUM(1,,2)"), num(3.0));
    assert_eq!(eval("=SUM(,)"), num(0.0));
    assert_eq!(eval("=SUM(1,)"), num(1.0));
    // 空值不进分母 / 不当 0 参与，与 Excel 一致。
    assert_eq!(eval("=AVERAGE(1,,3)"), num(2.0));
    assert_eq!(eval("=COUNT(1,,3)"), num(2.0));
    assert_eq!(eval("=PRODUCT(2,,3)"), num(6.0));
    assert_eq!(eval("=MIN(1,,5)"), num(1.0));
    assert_eq!(eval("=MAX(1,,5)"), num(5.0));
    assert_eq!(eval("=CONCAT(1,,2)"), text("12"));
    assert_eq!(eval("=ROUND(3.14159,)"), num(3.0));
    // AGGREGATE 的 options 空 ⇒ 0（不忽略任何东西）。
    assert_eq!(eval("=AGGREGATE(9,,F1:F5)"), num(15.0));
}

#[test]
fn omitted_arg_in_the_lookup_family() {
    assert_eq!(eval("=VLOOKUP(3,F1:G5,2,)"), num(30.0));
    assert_eq!(eval("=HLOOKUP(1,F1:G5,2,)"), num(2.0));
    assert_eq!(eval("=MATCH(3,F1:F5,)"), num(3.0));
    assert_eq!(eval("=XMATCH(3,F1:F5,)"), num(3.0));
    assert_eq!(eval("=OFFSET(F1,1,)"), num(2.0));
    assert_eq!(eval("=OFFSET(F1,,1)"), num(10.0));
    assert_eq!(eval("=RANK(3,F1:F5,)"), num(3.0));
}

/// 报障的这一条：省略 `if_not_found` 同时给 `match_mode`。
#[test]
fn xlookup_skips_if_not_found_but_keeps_match_mode() {
    assert_eq!(eval("=XLOOKUP(3,F1:F5,G1:G5,,-1)"), num(30.0));
    assert_eq!(eval("=XLOOKUP(3,F1:F5,G1:G5,,,-1)"), num(30.0));
    assert_eq!(eval("=XLOOKUP(3,F1:F5,G1:G5,)"), num(30.0));
    assert_eq!(eval("=XLOOKUP(0,F1:F5,G1:G5,\"nf\",-1)"), text("nf"));
}

/// 空占位的 `if_not_found` 等同「没提供」⇒ `#N/A`，**不是**把空值当兜底
/// 结果交出去。
///
/// 指向空格的引用是**另一回事**：那是提供了一个值，原样交出去。这条边界
/// 是 `arg_is_omitted` 按语法判而不是按值判的直接后果 —— 见那里的注释与
/// `golden_replay` 抓到的反例。
#[test]
fn an_omitted_if_not_found_means_not_supplied() {
    assert_eq!(
        eval("=XLOOKUP(0,F1:F5,G1:G5,,-1)"),
        Value::Error(ValueError::NotAvailable)
    );
    assert_eq!(
        eval("=XLOOKUP(0,F1:F5,G1:G5)"),
        Value::Error(ValueError::NotAvailable)
    );
    // Z99 是空格 —— 提供了一个空值，不是「没提供」。
    assert_eq!(eval("=XLOOKUP(0,F1:F5,G1:G5,Z99,-1)"), Value::Null);
}

/// `TEXTJOIN` 的 ignore_empty 空 ⇒ FALSE。强转失败判 `#TYPE!` 会把整条折掉。
#[test]
fn textjoin_blank_ignore_empty_defaults_to_false() {
    assert_eq!(eval("=TEXTJOIN(\",\",,1,2)"), text("1,2"));
    assert_eq!(eval("=TEXTJOIN(\",\",FALSE,1,2)"), text("1,2"));
}

/// 动态数组：可选参数「空 ⇒ 取默认值」而不是「强转 0」。
/// `=SORT(区域,,-1)` 是 Excel 里最常见的降序写法，强转 0 会撞上
/// 「sort_index 必须 ≥ 1」判成 `#VALUE!`。
#[test]
fn dynamic_array_optional_args_take_their_default_not_zero() {
    assert_eq!(eval_spill("=SORT(F1:F5,,-1)"), "5 ; 4 ; 3 ; 2 ; 1");
    assert_eq!(eval_spill("=SORT(F1:F5,)"), "1 ; 2 ; 3 ; 4 ; 5");
    assert_eq!(eval_spill("=SEQUENCE(2,,)"), "1 ; 2");
    assert_eq!(eval_spill("=SEQUENCE(2,)"), "1 ; 2");
    assert_eq!(eval_spill("=FILTER(F1:F5,F1:F5>3,)"), "4 ; 5");
    assert_eq!(eval_spill("=UNIQUE(F1:F5,,)"), "1 ; 2 ; 3 ; 4 ; 5");
}

/// 「取默认值」只认**语法上的空占位**，不认「求值成空」。
///
/// 指向空格的引用是提供了一个值，在数值语境下强转成 0 —— Excel 也是这样
/// （`=SEQUENCE(3,1,空格)` 是 0/1/2 而不是 1/2/3）。按值判会让不含 `,,`
/// 的公式也改行为，`tests/golden_replay.rs` 的漂移哨兵抓到过（seed 11
/// 第 853 行）。TS 引擎在这里按值判，是一条已知的跨引擎分歧。
#[test]
fn a_reference_to_an_empty_cell_is_not_an_omitted_argument() {
    // sort_index 强转 0 ⇒ 撞上「必须 ≥ 1」。
    assert_eq!(
        eval("=SORT(F1:F5,Z99,-1)"),
        Value::Error(ValueError::InvalidValue)
    );
    // SEQUENCE 的 start 强转 0 ⇒ 从 0 起数，不是从默认的 1。
    assert_eq!(eval_spill("=SEQUENCE(3,1,Z99)"), "0 ; 1 ; 2");
    assert_eq!(eval_spill("=SEQUENCE(3,1,)"), "1 ; 2 ; 3");
}

/// TEXTSPLIT 的 ignore_empty 空 ⇒ FALSE（空片段保留）。
#[test]
fn textsplit_blank_ignore_empty_keeps_empty_fields() {
    assert_eq!(eval_spill("=TEXTSPLIT(\"a,,b\",\",\",,)"), "a||b");
    assert_eq!(eval_spill("=TEXTSPLIT(\"a,,b\",\",\",,TRUE)"), "a|b");
}

/// 结果**是**空值时保持空值，不折成 0 —— 与 `=IF(TRUE,Z99,5)` 同款，
/// 属于显示层约定，不是空占位的问题。
#[test]
fn a_blank_result_stays_blank() {
    assert_eq!(eval("=IF(TRUE,,5)"), Value::Null);
    assert_eq!(eval("=IF(FALSE,,5)"), num(5.0));
    assert_eq!(eval("=IFERROR(1/0,)"), Value::Null);
    assert_eq!(eval("=CHOOSE(2,1,,3)"), Value::Null);
    assert_eq!(eval("=LEFT(\"abc\",)"), text(""));
    assert_eq!(eval("=MID(\"abcdef\",2,)"), text(""));
}

