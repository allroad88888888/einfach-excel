//! 区域里的空格**要能被数出来、被拼出来** —— 这是**基数**问题，不是位次问题。
//!
//! 根因与 `tests/sparse_range_hole_positions.rs` 同源但不同面：
//! `EvalProvider::for_each_range_cell` 的契约是**只发非空格**，三个 provider 都稀疏。
//! 位次那一面已修好（`for_each_arg_value_positioned` 交出绝对位置），但「这区域里
//! 有几个空格」这个**基数**信息回调拿不到 —— 没发出来的格子在回调看来不存在。于是
//! `A1=1 / A2 空 / A3=3` 上 `COUNTBLANK(A1:A3)` 答 0（Excel 1）、
//! `TEXTJOIN(",",FALSE,A1:A3)` 答 `"1,3"`（Excel `"1,,3"`；同一引擎里数组字面量
//! 形态 `{1,"",3}` 一直答对，自相矛盾）。
//!
//! 修法是给 `for_each_arg_value_indexed` 加返回值：区域的**矩形格数**。
//! 「矩形格数 − 回调被调次数」就是被跳过的空格数，**一个空格都不用访问**。
//! 两条硬边界：**禁止物化空格**（围栏 `whole_grid_countblank_is_closed_form`，
//! 1.7e10 格，遍历实现跑不完）；**`TEXTJOIN` 补洞自带上限**（围栏
//! `whole_column_textjoin_hits_the_char_cap_instead_of_walking_the_grid`）。
//! 必须走 Sheet/Workbook 集成路径：单元测试的 `AtomEvalProvider` 是**稠密**的，
//! 空格照发不误，改前也绿 —— 抓不住这个 bug。
//!
//! 口径依据是**实测 Excel**（16.111.2 for Mac）：`COUNTBLANK(A:A)` = 1048574、
//! `COUNTBLANK(1:1)` = 16383、整网格 = 2³⁴、`=""` 算空而 `0` / `" "` / 错误不算。

use einfach_core::Value;
use einfach_excel_core::{Sheet, Workbook};

/// 把公式装到 Z9（远离被测区域）再读值。注意：Z9 自己也是一个非空格，
/// 整列 / 整网格用例里要把它算进去。
fn probe(sheet: &mut Sheet, formula: &str) -> Value {
    assert!(sheet.set_formula("Z9", formula), "公式装不进去: {formula}");
    sheet.get_cell("Z9")
}

fn number(sheet: &mut Sheet, formula: &str) -> f64 {
    match probe(sheet, formula) {
        Value::Number(n) => n,
        other => panic!("{formula} 期望 Number，得到 {other:?}"),
    }
}

fn text(sheet: &mut Sheet, formula: &str) -> String {
    match probe(sheet, formula) {
        Value::Text(s) => s,
        other => panic!("{formula} 期望 Text，得到 {other:?}"),
    }
}

/// A1=1 / A2 空 / A3=3 —— 本文件的基本形状。
fn hole_in_the_middle() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet
}

// ───────────────────────── COUNTBLANK：基数 ─────────────────────────

#[test]
fn countblank_sees_the_hole_a_sparse_walk_never_emits() {
    let mut sheet = hole_in_the_middle();
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:A3)"), 1.0);
    // 区域拉长，尾部两个空格照数；缩到没有洞就是 0。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:A5)"), 3.0);
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:A1)"), 0.0);
    // 单个空格也是一格 —— 「1×1 区域」这条路径以前同样答 0。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(B7)"), 1.0);
    // 二维矩形：B1:C2 四格全空；A1:B3 六格里 A1 / A3 有值 → 4 个空格。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(B1:C2)"), 4.0);
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:B3)"), 4.0);
}

/// **口径**：整列引用下空格的基数 = 网格大小 − 非空格数。依据是本仓 TS 参考引擎
/// 里**先落地**的那条断言（`excel/excel-core-ts/test/evaluate.test.ts` 的
/// 「COUNTBLANK streams whole-column refs and counts implicit blanks」，在 4 个
/// 非空格上要求 `COUNTBLANK(A:A) === 1_048_574`）。Rust 侧向它收敛。
#[test]
fn whole_column_and_whole_row_countblank_use_the_grid_extent() {
    let mut sheet = hole_in_the_middle();
    // A 列 1048576 格，非空的是 A1 / A3 两格（Z9 在 Z 列，不在 A 列）。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A:A)"), 1_048_576.0 - 2.0);
    // 第 1 行非空的只有 A1；第 9 行非空的只有探针自己（Z9）。均 16384 格。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(1:1)"), 16_384.0 - 1.0);
    assert_eq!(number(&mut sheet, "=COUNTBLANK(9:9)"), 16_384.0 - 1.0);
}

/// **不物化的围栏**：整个网格 1048576 × 16384 ≈ 1.7e10 格。闭式实现是两次减法
/// （实测亚毫秒）；「遍历矩形」的实现即便每格 1 ns 也要 17 秒，实际是分钟级或
/// 直接 OOM。所以这条绿着本身就是证明，不必断言耗时。
#[test]
fn whole_grid_countblank_is_closed_form() {
    let mut sheet = hole_in_the_middle();
    let total = 1_048_576.0 * 16_384.0;
    // 非空格：A1 / A3 / 探针自己 Z9。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A:XFD)"), total - 3.0);
}

/// Excel 的 COUNTBLANK 把**算出空文本 `""` 的公式格**也算空，而 COUNTA 把它
/// 算作非空 —— 两者**不是互补关系**，同一格会被两边都数进去。
#[test]
fn empty_text_counts_as_blank_but_countblank_is_not_the_complement_of_counta() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("A2", "=\"\""));
    sheet.set_cell("A3", Value::Number(3.0));

    assert_eq!(sheet.get_cell("A2"), Value::Text(String::new()));
    // A2 发得出来（它是个公式格），但值算空。
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:A3)"), 1.0);
    // 同一格 COUNTA 算非空 → 1 + 3 = 4 > 3 格，正是「不互补」的样子。
    assert_eq!(number(&mut sheet, "=COUNTA(A1:A3)"), 3.0);
    // TEXTJOIN 眼里 `""` 本来就发得出来，两种口径都不变 —— 防补洞把它重复计一次。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:A3)"), "1,,3");
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A3)"), "1,3");

    // 直接存进去的空文本同理。
    let mut lit = Sheet::new();
    lit.set_cell("A1", Value::Number(1.0));
    lit.set_cell("A2", Value::Text(String::new()));
    assert_eq!(number(&mut lit, "=COUNTBLANK(A1:A2)"), 1.0);
}

/// 错误格、`0`、空格串 `" "` 都**不**算空（实测 Excel 三条都是 0）。
#[test]
fn errors_zeros_and_spaces_are_not_blank() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=1/0"));
    sheet.set_cell("A2", Value::Number(0.0));
    sheet.set_cell("A3", Value::Text(" ".into()));
    assert_eq!(number(&mut sheet, "=COUNTBLANK(A1:A3)"), 0.0);
    assert_eq!(number(&mut sheet, "=COUNTBLANK(1/0)"), 0.0);
}

/// 微软文档的签名就是 `COUNTBLANK(range)` 单参（实测 Excel 连存都不让存）。
#[test]
fn countblank_keeps_its_single_range_signature() {
    let mut sheet = hole_in_the_middle();
    let two = probe(&mut sheet, "=COUNTBLANK(A1:A3,C1:C3)");
    assert!(matches!(two, Value::Error(_)));
    assert!(matches!(probe(&mut sheet, "=COUNTBLANK()"), Value::Error(_)));
}

// ───────────────────────── TEXTJOIN：空格占位 ─────────────────────────

#[test]
fn textjoin_keeps_holes_when_ignore_empty_is_false() {
    let mut sheet = hole_in_the_middle();
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:A3)"), "1,,3");
    // ignore_empty = TRUE 的口径不变 —— 空格该丢还是丢。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A3)"), "1,3");
    // 同一个引擎里的数组字面量形态一直是对的，两种形态现在一致了。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",FALSE,{1,\"\",3})"), "1,,3");
}

#[test]
fn textjoin_fills_leading_and_trailing_holes() {
    // 前导洞：区域从 A1 起，但 A1 是空的。
    let mut leading = Sheet::new();
    leading.set_cell("A2", Value::Number(1.0));
    leading.set_cell("A3", Value::Number(3.0));
    assert_eq!(text(&mut leading, "=TEXTJOIN(\",\",FALSE,A1:A3)"), ",1,3");
    // 尾部洞：最后一个非空格之后的位次也要补齐。
    let mut trailing = hole_in_the_middle();
    assert_eq!(text(&mut trailing, "=TEXTJOIN(\",\",FALSE,A1:A5)"), "1,,3,,");
    // 只有洞。
    assert_eq!(text(&mut trailing, "=TEXTJOIN(\",\",FALSE,C1:C3)"), ",,");
}

#[test]
fn textjoin_fills_holes_in_row_major_order() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B2", Value::Number(4.0));
    // 行主序：A1=1 / B1 空 / A2 空 / B2=4。列主序会给 "1,,,4" 之外的排法。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:B2)"), "1,,,4");
}

#[test]
fn textjoin_counts_holes_per_argument() {
    let mut sheet = hole_in_the_middle();
    // 每个实参各自补自己的洞，不会把上一个实参的位次带过来。
    let two = text(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:A3,A1:A3)");
    assert_eq!(two, "1,,3,1,,3");
    // 区域与标量混排。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:A3,\"x\")"), "1,,3,x");
}

/// **上限保护（一）**：分隔符为空串时补洞是恒等操作，直接跳过整条补洞路径。
/// 所以「整列 + 空分隔符」不会去铺一百万个位置，答案与稀疏流一致。
#[test]
fn empty_delimiter_short_circuits_hole_filling() {
    let mut sheet = hole_in_the_middle();
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\"\",FALSE,A:A)"), "13");
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\"\",FALSE,A1:A5)"), "13");
}

/// **上限保护（二）**：分隔符非空时每补一个洞至少多一个字符，所以补洞循环最多
/// 跑到 32767 字符上限就停手 —— `TEXTJOIN(",",FALSE,A:A)` 走「补满约 32768 个
/// 空片段 → `#VALUE!`」而不是「走一百万格」。这也正是 Excel 的答案：一百万个
/// 分隔符远超单元格 32767 字符上限。
#[test]
fn whole_column_textjoin_hits_the_char_cap_instead_of_walking_the_grid() {
    let mut sheet = hole_in_the_middle();
    assert!(matches!(
        probe(&mut sheet, "=TEXTJOIN(\",\",FALSE,A:A)"),
        Value::Error(_)
    ));
    // ignore_empty = TRUE 没有补洞，整列照样是稀疏流。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A:A)"), "1,3");
    // 整行 16384 格 → 16383 个分隔符，**没到**上限，要真算出来。
    let row = text(&mut sheet, "=TEXTJOIN(\",\",FALSE,1:1)");
    assert_eq!(row.chars().count(), 16_384);
    assert!(row.starts_with("1,,"), "整行应以 A1 的值打头: {row:.10}");
}

#[test]
fn textjoin_still_propagates_errors_from_range_cells() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("A3", "=1/0"));
    assert!(matches!(
        probe(&mut sheet, "=TEXTJOIN(\",\",FALSE,A1:A3)"),
        Value::Error(_)
    ));
}

// ───────────────────────── 跨表 ─────────────────────────

#[test]
fn cross_sheet_ranges_get_the_same_treatment() {
    let mut wb = Workbook::new();
    let src = wb.add_sheet("Src");
    wb.sheet_mut(src).unwrap().set_cell("A1", Value::Number(1.0));
    wb.sheet_mut(src).unwrap().set_cell("A3", Value::Number(3.0));
    let dst = wb.add_sheet("Dst");

    wb.sheet_mut(dst).unwrap().set_formula("B1", "=COUNTBLANK(Src!A1:A3)");
    assert_eq!(wb.sheet(dst).unwrap().get_cell("B1"), Value::Number(1.0));

    wb.sheet_mut(dst)
        .unwrap()
        .set_formula("B2", "=TEXTJOIN(\",\",FALSE,Src!A1:A3)");
    assert_eq!(
        wb.sheet(dst).unwrap().get_cell("B2"),
        Value::Text("1,,3".to_string())
    );
}

// ───────────────────── 反向围栏：不该受影响的一族 ─────────────────────

/// 空格**不占**答案的那一大批：聚合、计数、排序、以及 `ignore_empty` 为真的
/// 拼接。这条用例是防「补洞」漏到它们身上。
#[test]
fn blank_insensitive_functions_are_unchanged() {
    let mut sheet = hole_in_the_middle();
    assert_eq!(number(&mut sheet, "=SUM(A1:A3)"), 4.0);
    assert_eq!(number(&mut sheet, "=COUNT(A1:A3)"), 2.0);
    assert_eq!(number(&mut sheet, "=COUNTA(A1:A3)"), 2.0);
    assert_eq!(number(&mut sheet, "=AVERAGE(A1:A3)"), 2.0);
    assert_eq!(number(&mut sheet, "=MAX(A1:A3)"), 3.0);
    assert_eq!(number(&mut sheet, "=MIN(A1:A3)"), 1.0);
    assert_eq!(number(&mut sheet, "=LARGE(A1:A3,1)"), 3.0);
    assert_eq!(number(&mut sheet, "=SMALL(A1:A3,1)"), 1.0);
    assert_eq!(number(&mut sheet, "=SUBTOTAL(2,A1:A3)"), 2.0);
    assert_eq!(number(&mut sheet, "=AGGREGATE(2,0,A1:A3)"), 2.0);
    // CONCAT 天生就是「空分隔符的 TEXTJOIN」，空格对它不可见。
    assert_eq!(text(&mut sheet, "=CONCAT(A1:A3)"), "13");
    // 位次一族（上一程修的）不受影响；整列聚合仍然稀疏。
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:A3,0)"), 3.0);
    assert_eq!(number(&mut sheet, "=XMATCH(3,A1:A3)"), 3.0);
    assert_eq!(number(&mut sheet, "=SUM(A:A)"), 4.0);
    assert_eq!(number(&mut sheet, "=COUNTA(A:A)"), 2.0);
}

/// `FREQUENCY` 的 bins 里空格**该被忽略**，不该补成 0 —— 微软文档只有一句
/// 「FREQUENCY ignores blank cells and text」，空格与文本一视同仁。这条是**反向**
/// 围栏：别顺手把「空格要占位」推广过来。证据是文本 bin 与空格 bin 结果**全等**。
#[test]
fn frequency_ignores_blank_bins_exactly_like_text_bins() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C1", Value::Number(1.0)); // C2 空
    sheet.set_cell("C3", Value::Number(3.0));
    sheet.set_cell("E1", Value::Number(1.0));
    sheet.set_cell("E2", Value::Text("x".into())); // 文本 bin
    sheet.set_cell("E3", Value::Number(3.0));
    let blank_bins = probe(&mut sheet, "=FREQUENCY({1;2;3},C1:C3)");
    let text_bins = probe(&mut sheet, "=FREQUENCY({1;2;3},E1:E3)");
    assert_eq!(blank_bins, text_bins);
    // 2 个有效 bin → 3 行（文档：比 bins 的元素数多一个）。实测 Excel 对整列
    // bins（`G:G`，两个数值）同样只给 3 行 —— 与 COUNTBLANK 的矩形口径**相反**，
    // FREQUENCY 是按内容定尺寸的。别把一套口径套到两个函数上。
    assert!(matches!(&blank_bins, Value::Array(a) if a.shape() == (3, 1)));

    // ⚠️ **已知分歧，未修**：bins 全空时本引擎按文档「returns the number of
    // elements in data_array」给 1 行 [3]，但实测 Excel 给 **2 行 [1,4]** ——
    // 它把全空 bins 当成单个 `{0}` bin。TS 参考引擎与本引擎一致，两侧都得改才
    // 有意义，且与本轮「空格基数」根因无关，另开一条。
    let no_bins = probe(&mut sheet, "=FREQUENCY({1;2;3},D1:D3)");
    assert!(matches!(&no_bins, Value::Array(a) if a.shape() == (1, 1)));
}
