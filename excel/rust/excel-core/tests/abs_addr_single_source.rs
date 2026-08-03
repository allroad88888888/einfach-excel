//! `[$]列[$]行` 的写出只有一份实现 —— 这个文件是那条约束的执行者。
//!
//! # 背景
//!
//! 引擎里有四条路径要把一个地址写成公式文本：
//!
//! | 路径 | 入口 | 谁调的 |
//! |---|---|---|
//! | AST 渲染 | `render_formula`（`shift::render::render_abs_addr`） | 插删行列后重写已解析公式 |
//! | 未解析源码重写 | `shift::rewrite_parked_source` | 同上，但公式还没解析（惰性路径） |
//! | 地址回文本 | `CellAddress::to_string_repr` | 到处 |
//! | `ADDRESS` / `CELL("address")` | `eval` | 用户公式 |
//!
//! 2026-08-03 之前，前三条各留了一份逐字节相同的 `if abs { push('$') }` +
//! 列名进位循环；`shift::render::col_only` 的注释甚至自陈「Mirrors the private
//! helper in `cell.rs`; duplicated here」。现在前三条全部收敛到
//! `cell::push_abs_col` / `push_abs_row` / `push_abs_addr`。
//!
//! **第四条没有收敛**：`eval::col_index_to_letters_eval` 仍是独立的一份拷贝
//! （`eval.rs` 在 INV-6 的文件清单里，收敛它要走豁免流程）。所以这个文件对它
//! 用的是「本地常量 + 断言它等于权威值」那一招 —— 拷贝可以留着，但它一旦漂移，
//! 这里立刻红。
//!
//! # 为什么不用注释而用测试
//!
//! 同一段逻辑复制 N 份在本仓咬过：数字转文本曾有五份，三处
//! `if n == n.floor() && n.abs() < 1e15` 逐字节相同却互不调用，结果
//! `=10^21&""` 显示 `1E+21` 而裸的 `=10^21` 显示 `1000000000000000000000`。
//! 那一份靠注释互相指认了很久，没拦住。

use einfach_core::Value;
use einfach_excel_core::formula::RefAbs;
use einfach_excel_core::shift::{rewrite_parked_source, ShiftEdit, SourceRewrite};
use einfach_excel_core::{parse_formula, render_formula, CellAddress, Expr, Workbook};

/// 一条用例：`(编辑前的记号, 编辑后应有的记号, 0-based 列, 0-based 行, 列绝对, 行绝对)`。
///
/// 「编辑」固定是 `RowInsert { at: 0, count: 1 }` —— 每个地址的行号 +1，
/// 所以 `before` 的行号恰好比 `row` 小 1，而列号与两个 `$` 标记必须原样保留。
///
/// 覆盖点：`$` 的四种组合、`Z`→`AA` 进位、`ZZ`→`AAA` 二次进位、Excel 最右列
/// `XFD`（16383），以及行号进位（`99`→`100`）。
const CASES: &[(&str, &str, u32, u32, bool, bool)] = &[
    ("A1", "A2", 0, 1, false, false),
    ("$A1", "$A2", 0, 1, true, false),
    ("A$1", "A$2", 0, 1, false, true),
    ("$A$1", "$A$2", 0, 1, true, true),
    ("Z1", "Z2", 25, 1, false, false),
    ("AA1", "AA2", 26, 1, false, false),
    ("$AA$1", "$AA$2", 26, 1, true, true),
    ("AB99", "AB100", 27, 99, false, false),
    ("$AB$99", "$AB$100", 27, 99, true, true),
    ("ZZ1", "ZZ2", 701, 1, false, false),
    ("AAA1", "AAA2", 702, 1, false, false),
    ("XFD1", "XFD2", 16383, 1, false, false),
    ("$XFD$1048575", "$XFD$1048576", 16383, 1048575, true, true),
];

/// 权威写法：走公开的 AST 渲染入口，即 `cell::push_abs_addr` 那唯一一份实现。
/// 其余三条路径都要与它逐字节相同。
fn authoritative(col: u32, row: u32, col_abs: bool, row_abs: bool) -> String {
    let expr = Expr::CellRef(
        CellAddress::new(row, col),
        RefAbs {
            col: col_abs,
            row: row_abs,
        },
    );
    let rendered = render_formula(&expr);
    rendered
        .strip_prefix('=')
        .expect("render_formula 必须以 = 开头")
        .to_string()
}

/// 表里的 `after` 字面量本身就是权威值 —— 先钉死这一条，后面三个测试才有
/// 「同一份输入」的公共参照物。表写错了在这里红，而不是把三条路径一起带偏。
#[test]
fn table_literals_are_the_authoritative_bytes() {
    for &(_, after, col, row, col_abs, row_abs) in CASES {
        assert_eq!(
            authoritative(col, row, col_abs, row_abs),
            after,
            "AST 渲染路径写出的不是 {after}"
        );
        // 顺带钉住往返：权威写法必须能被解析器读回同一棵树。
        let src = format!("={after}");
        let expr = parse_formula(&src).unwrap_or_else(|| panic!("{src} 必须能解析"));
        assert_eq!(render_formula(&expr), src, "{src} 必须逐字节往返");
    }
}

/// 未解析源码路径（`rewrite_parked_source` → `cell::push_abs_addr`）与 AST
/// 渲染路径必须写出同一串字节。
///
/// 这两条此前是两份独立实现：文本侧吃两个裸 `bool`，AST 侧吃 `RefAbs`。
#[test]
fn parked_source_rewrite_matches_the_authoritative_bytes() {
    let edit = ShiftEdit::RowInsert { at: 0, count: 1 };
    for &(before, after, col, row, col_abs, row_abs) in CASES {
        let got = rewrite_parked_source(&format!("={before}"), edit);
        assert_eq!(
            got,
            SourceRewrite::Rewritten(format!("={after}")),
            "未解析源码路径重写 ={before} 的结果与 AST 渲染不一致"
        );
        assert_eq!(
            got,
            SourceRewrite::Rewritten(format!("={}", authoritative(col, row, col_abs, row_abs))),
        );
    }
}

/// `CellAddress::to_string_repr` 就是两个 `$` 都不加的那一档。
#[test]
fn to_string_repr_is_the_no_dollar_case() {
    for &(_, _, col, row, _, _) in CASES {
        assert_eq!(
            CellAddress::new(row, col).to_string_repr(),
            authoritative(col, row, false, false),
            "to_string_repr 与权威写法在 (row={row}, col={col}) 上分叉了"
        );
    }
}

/// `(col_abs, row_abs)` → `ADDRESS` 的 `abs_num`。
/// eval 侧的口径是 `1=$A$1, 2=A$1, 3=$A1, 4=A1`。
fn abs_num(col_abs: bool, row_abs: bool) -> u32 {
    match (col_abs, row_abs) {
        (true, true) => 1,
        (false, true) => 2,
        (true, false) => 3,
        (false, false) => 4,
    }
}

/// **eval 侧那份没收敛的拷贝**（`eval::col_index_to_letters_eval` + `ADDRESS`
/// 自己拼的 `$`）必须与权威写法逐字节相同。
///
/// `eval.rs` 在 INV-6 的文件清单里，所以它的拷贝留着；这条测试是留着它的代价。
/// 它红了说明两侧的列名进位或 `$` 位置有一侧改了 —— 先对表，别改测试。
#[test]
fn eval_address_function_matches_the_authoritative_bytes() {
    let mut wb = Workbook::new();
    for (i, &(_, after, col, row, col_abs, row_abs)) in CASES.iter().enumerate() {
        let cell = format!("A{}", i + 1);
        wb.set_formula(
            0,
            &cell,
            &format!(
                "=ADDRESS({}, {}, {})",
                row + 1,
                col + 1,
                abs_num(col_abs, row_abs)
            ),
        );
        assert_eq!(
            wb.get_cell("Sheet1", &cell),
            Value::Text(after.to_string()),
            "ADDRESS 与权威写法在 {after} 上分叉了"
        );
    }
}

/// `CELL("address", ref)` 是 eval 侧那份拷贝的第二个出口，口径固定为
/// 两个 `$` 全加。
#[test]
fn eval_cell_address_info_matches_the_authoritative_bytes() {
    let mut wb = Workbook::new();
    // 宿主格挪到 2001 行往后：表里的目标地址全在前 100 行，同格自指会被
    // 判成 `#CYCLIC!`，那就测不到写出逻辑了。最后一条（第 1048576 行）不测，
    // 它只是同一段逻辑的又一次重复。
    for (i, &(_, _, col, row, _, _)) in CASES.iter().enumerate().take(CASES.len() - 1) {
        let host = format!("A{}", 2001 + i);
        let target = authoritative(col, row, false, false);
        wb.set_formula(0, &host, &format!("=CELL(\"address\", {target})"));
        assert_eq!(
            wb.get_cell("Sheet1", &host),
            Value::Text(authoritative(col, row, true, true)),
            "CELL(\"address\") 与权威写法在 {target} 上分叉了"
        );
    }
}

/// 整列 / 整行范围只写半个地址（`[$]列:[$]列`、`[$]行:[$]行`）—— 那是
/// `push_abs_col` / `push_abs_row` 单独出场的地方，收敛前同样是 AST 侧
/// （`render_range_body`）与文本侧（`parked_band`）各一份。
#[test]
fn whole_band_rewrite_matches_the_authoritative_bytes() {
    // (编辑前, 编辑后, 编辑)
    let cases: &[(&str, &str, ShiftEdit)] = &[
        (
            "=SUM(A:C)",
            "=SUM(B:D)",
            ShiftEdit::ColInsert { at: 0, count: 1 },
        ),
        (
            "=SUM($A:$C)",
            "=SUM($B:$D)",
            ShiftEdit::ColInsert { at: 0, count: 1 },
        ),
        (
            "=SUM(Z:AA)",
            "=SUM(AA:AB)",
            ShiftEdit::ColInsert { at: 0, count: 1 },
        ),
        (
            "=SUM($Z:AA)",
            "=SUM($AA:AB)",
            ShiftEdit::ColInsert { at: 0, count: 1 },
        ),
        (
            "=SUM(1:3)",
            "=SUM(2:4)",
            ShiftEdit::RowInsert { at: 0, count: 1 },
        ),
        (
            "=SUM($1:$3)",
            "=SUM($2:$4)",
            ShiftEdit::RowInsert { at: 0, count: 1 },
        ),
        (
            "=SUM(99:100)",
            "=SUM(100:101)",
            ShiftEdit::RowInsert { at: 0, count: 1 },
        ),
    ];
    for &(before, after, edit) in cases {
        assert_eq!(
            rewrite_parked_source(before, edit),
            SourceRewrite::Rewritten(after.to_string()),
            "未解析源码路径重写 {before} 的结果不是 {after}"
        );
        // AST 侧对同一份输出必须逐字节同意。
        let expr = parse_formula(after).unwrap_or_else(|| panic!("{after} 必须能解析"));
        assert_eq!(
            render_formula(&expr),
            after,
            "AST 渲染路径与未解析源码路径在 {after} 上分叉了"
        );
    }
}
