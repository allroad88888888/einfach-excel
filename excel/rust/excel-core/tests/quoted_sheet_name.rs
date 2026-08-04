//! 带引号表名 —— **读侧**：`'My Sheet'!A1` 解析得出来、算得对。
//!
//! 表名带空格是 Excel 的**默认行为**（新建的 "Sheet 1"、用户改名成
//! "销售 数据"），任何引用都得加引号。此前 Rust 侧 `formula/primary.rs` 的
//! 首字符分流里根本没有 `'` 这一支，于是**连有界形式 `'My Sheet'!A1` 都解析
//! 不出来** —— 整条公式失败，`#VALUE!` 是「没解析成」的通用码，求值器根本没
//! 被调用过。TS 侧（`parser/tokenizer.ts::readQuotedSheetName`）一直是完整
//! 支持的，两个后端可在运行期互换，所以这是「同一份工作簿，宿主选 TS 能算、
//! 选 WASM 整条公式挂掉」。
//!
//! 写侧（渲染回公式文本时重新加引号）在 `quoted_sheet_name_render.rs`。

mod quoted_sheet_support;

use einfach_core::{Value, ValueError};
use einfach_excel_core::{parse_formula, CellAddress, CellRange};
use quoted_sheet_support::{eval, fixture, MY_SHEET};

// ---------------------------------------------------------------- 复现用例

/// 报障形状本身：有界形式此前**连解析都过不去**。
#[test]
fn quoted_sheet_bounded_ref_evaluates() {
    assert_eq!(eval("='My Sheet'!A1"), Value::Number(1.0));
    assert_eq!(eval("=SUM('My Sheet'!A1:A3)"), Value::Number(4.0));
    assert_eq!(eval("=SUM('My Sheet'!A1:B3)"), Value::Number(404.0));
}

/// 与不带引号的同形表逐条同值 —— 引号只影响「表名怎么取」，不影响下游。
#[test]
fn quoted_and_bare_paths_agree() {
    assert_eq!(eval("=SUM('My Sheet'!A1:A3)"), eval("=SUM(Plain!A1:A3)"));
    assert_eq!(eval("=SUM('My Sheet'!A:A)"), eval("=SUM(Plain!A:A)"));
    // 闭式字面量，别只写「两侧相等」。
    assert_eq!(eval("=SUM(Plain!A1:A3)"), Value::Number(4.0));
    assert_eq!(eval("=SUM(Plain!A:A)"), Value::Number(4.0));
    // **不必要的引号**：`'Plain'!A1` 与 `Plain!A1` 同值。引号是写法不是语义，
    // 解析出来的语法树里不留痕（见 `quoted_sheet_name_render.rs` 的往返口径）。
    assert_eq!(eval("='Plain'!A1"), Value::Number(1.0));
    assert_eq!(eval("=Plain!A1"), Value::Number(1.0));
}

/// 三种需要引号的表名各走一遍。
#[test]
fn every_quoted_name_shape_resolves() {
    assert_eq!(eval("=SUM('My Sheet'!A1:A3)"), Value::Number(4.0));
    // `''` 是转义的单引号：表名是 `It's`。
    assert_eq!(eval("=SUM('It''s'!A1:A3)"), Value::Number(4.0));
    assert_eq!(eval("=SUM('销售 数据'!A1:A3)"), Value::Number(4.0));
}

/// 分隔符是**闭合引号之后**的那个 `!` —— 引号内的 `!` 只是普通字符，所以带
/// `!` 的表名不产生歧义。
#[test]
fn bang_inside_the_quotes_is_part_of_the_name() {
    let mut wb = fixture();
    let idx = wb.add_sheet("A!B");
    wb.sheet_mut(idx)
        .unwrap()
        .set_cell("A1", Value::Number(9.0));
    wb.set_formula(0, "E1", "='A!B'!A1");
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(9.0));
}

// ------------------------------------------------------------ 相邻面：整轴

/// 带引号 + 整轴。复用上一批新增的 `finish_sheet_qualified_ref`，所以整列 /
/// 整行 / `$` 变体一条都不用为带引号再写一遍 —— 这几行钉的就是那条复用。
#[test]
fn quoted_sheet_whole_axis() {
    assert_eq!(eval("=SUM('My Sheet'!A:A)"), Value::Number(4.0));
    assert_eq!(eval("=COUNT('My Sheet'!A:A)"), Value::Number(2.0));
    assert_eq!(eval("=SUM('My Sheet'!A:B)"), Value::Number(404.0));
    // 整行：第 1 行是 A1=1 + B1=100。
    assert_eq!(eval("=SUM('My Sheet'!1:1)"), Value::Number(101.0));
    assert_eq!(eval("=SUM('My Sheet'!1:3)"), Value::Number(404.0));
    // `$` 变体与相对形式同值。
    assert_eq!(eval("=SUM('My Sheet'!$A:$A)"), Value::Number(4.0));
    assert_eq!(eval("=SUM('My Sheet'!$1:$3)"), Value::Number(404.0));
    // 整轴的矩形基数：夹到网格上限之后仍是 1048576 − 2。
    assert_eq!(
        eval("=COUNTBLANK('My Sheet'!A:A)"),
        Value::Number(1_048_574.0)
    );
}

/// 带引号 + `$` 的单格形式。
#[test]
fn quoted_sheet_absolute_cell_ref() {
    assert_eq!(eval("='My Sheet'!$A$1"), Value::Number(1.0));
    assert_eq!(eval("='My Sheet'!$A1"), Value::Number(1.0));
    assert_eq!(eval("='My Sheet'!A$1"), Value::Number(1.0));
    assert_eq!(eval("=SUM('My Sheet'!$A$1:$B$3)"), Value::Number(404.0));
}

/// 带引号 + spill（`A1#`）。`parse_spill_suffix` 只认 `CellRef` / `SheetRef`
/// 两种被包裹体，带引号解析出来的正是 `SheetRef`，所以后缀直接生效。
#[test]
fn quoted_sheet_spill_ref() {
    let mut wb = fixture();
    // 在 'My Sheet'!D1 溢出一列 3 个数，再从 Sheet1 引它的溢出域。
    wb.set_formula(MY_SHEET, "D1", "=SEQUENCE(3)");
    wb.set_formula(0, "E1", "=SUM('My Sheet'!D1#)");
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(6.0));
}

// -------------------------------------------------------------- 相邻面：错误

/// 表名不存在 → `#REF!`，与上一批统一后的不带引号口径对齐（`NoSuch!A1` 也是
/// `#REF!`），而不是「解析失败」的 `#VALUE!`。
#[test]
fn missing_quoted_sheet_is_ref_error() {
    assert_eq!(
        eval("='No Such Sheet'!A1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=SUM('No Such Sheet'!A:A)"),
        Value::Error(ValueError::InvalidRef)
    );
    // 不带引号的对照，同一个码。
    assert_eq!(eval("=NoSuch!A1"), Value::Error(ValueError::InvalidRef));
    // 空表名同理 —— 解析得出来（TS 侧也接受空名字），只是查不到表。
    assert_eq!(eval("=''!A1"), Value::Error(ValueError::InvalidRef));
}

/// 引号没闭合 → 整条公式解析失败，落在通用的 `#VALUE!` 上（TS 侧走
/// `tokenizer-error`，同样是整条失败）。
#[test]
fn unterminated_quote_is_a_parse_failure() {
    assert!(parse_formula("='My Sheet!A1").is_none());
    assert_eq!(
        eval("='My Sheet!A1"),
        Value::Error(ValueError::InvalidValue)
    );
}

// -------------------------------------------------------- 相邻面：其它入口

/// `INDIRECT` 走的是独立的文本解析路径，因此要单独覆盖带空格、转义单引号和
/// 中文表名；它们应与普通公式引用走同一套工作簿查找语义。
#[test]
fn indirect_accepts_quoted_sheet_names() {
    assert_eq!(eval("=INDIRECT(\"'My Sheet'!A1\")"), Value::Number(1.0));
    assert_eq!(eval("=INDIRECT(\"'It''s'!B3\")"), Value::Number(300.0));
    assert_eq!(eval("=INDIRECT(\"'销售 数据'!A3\")"), Value::Number(3.0));
    assert_eq!(eval("=INDIRECT(\"Plain!A1\")"), Value::Number(1.0));
}

/// 定义名的**定义体**里可以出现带引号表名 —— `define_name` 就是
/// `parse_formula` + 求值，所以解析侧一修就通了。
///
/// （名字本身的合法字符集 `[A-Za-z_][A-Za-z0-9_]*` 是另一回事，不受影响。）
#[test]
fn defined_name_body_accepts_quoted_sheet_names() {
    let mut wb = fixture();
    wb.define_name("QSUM", "=SUM('My Sheet'!A1:A3)").unwrap();
    wb.set_formula(0, "E1", "=QSUM");
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(4.0));

    wb.define_name("QCELL", "='It''s'!B3").unwrap();
    wb.set_formula(0, "E2", "=QCELL*2");
    assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(600.0));
}

/// 结构化表引用（`Table1[Col]`）本身**不带表名限定**（Excel 里表名全工作簿
/// 唯一，语法上没有 `'Sheet'!Table1[Col]` 这一形），所以带引号表名与它不
/// 相交。这条钉的是「表引用仍在带引号表上正常工作」，不是引号语法。
#[test]
fn structured_refs_still_work_on_a_quoted_sheet() {
    let mut wb = fixture();
    let s = wb.sheet_mut(MY_SHEET).unwrap();
    s.set_cell("D1", Value::Text("Qty".to_string()));
    s.set_cell("D2", Value::Number(5.0));
    s.set_cell("D3", Value::Number(7.0));
    let range = CellRange::new(CellAddress::new(0, 3), CellAddress::new(2, 3));
    wb.define_table(Some("QtyTable"), MY_SHEET, range, true)
        .unwrap();
    wb.set_formula(MY_SHEET, "E1", "=SUM(QtyTable[Qty])");
    assert_eq!(wb.get_cell("My Sheet", "E1"), Value::Number(12.0));
}
