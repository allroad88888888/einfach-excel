//! `TEXTSPLIT` 的**格数闸门** —— 动态数组家族点名单上最后一个漏网。
//!
//! `expand_cell_cap.rs` 那一批（EXPAND / CHOOSEROWS / CHOOSECOLS）修完时，
//! TEXTSPLIT 是唯一剩下的没闸门的，而且**两个引擎都没有**，所以留到两侧同批落
//! —— 单修一边只会把「都漏」换成「跨引擎分歧」。
//!
//! 为什么它能爆：输出是**两轴分隔符个数之积**，对长度 L 的文本最坏 (L/2)²。
//! 实测 2200 字符（1100 个 `;` + 1100 个 `,`）→ 1101 × 1101 = 1,212,201 格；
//! 公式能造出的最长文本（REPT 卡在 32767 字符）→ 16384 × 16384 =
//! 268,435,456 格 ≈ 6.4 GB。注意**输入是线性的**：`grid` 里的 String 总数
//! ≤ L + 行数，二次爆炸只发生在按 `max_cols` 补 pad 那一步，所以闸门钉在
//! `Vec::with_capacity` 之前就够，且不需要先把大东西建出来。
//!
//! 口径：复用 `eval.rs` 的 `checked_array_len` / `DYNAMIC_ARRAY_CELL_CAP`，
//! 超限一律 `#VALUE!`，与 `SEQUENCE` / `EXPAND` 完全一致。
//!
//! **1×N 分支（`row_delim` 缺席）刻意不设闸门**：它的格数 = 片段数 ≤ L + 1，
//! 线性；公式能造的最长文本 32767 字符 → 最坏 32768 格，只有上限的 3%。
//! 本文件把这条也钉住，免得后来人「顺手补全」而与 TS 侧岔开。
//!
//! **不在这里钉「超网格该给 `#NUM!` 还是 `#VALUE!`」**：那是 `eval.rs` 的
//! `DYNAMIC_ARRAY_CELL_CAP` 注释里登记的未决分歧，owner 待定。新闸门只数格数。
//!
//! 与 TS 侧 `excel/excel-core-ts/test/textsplit-cell-cap.test.ts` **同一组输入、
//! 同一组期望**（两个文件的用例一一对应）—— 这两个引擎的 TEXTSPLIT 没进跨引擎
//! 对照网，对称就靠这对文件。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

/// 上限本身：`DYNAMIC_ARRAY_CELL_CAP == 1_048_576 == 1024 × 1024`。
const CAP: u32 = 1_048_576;

/// 把数组折成标量再读，避免真的往表里溢出上百万格（每个非锚点目标都会建一个
/// 派生 atom）。`COUNTA` 在这里合用是因为它对**空文本**也计数 —— TEXTSPLIT 的
/// 大结果里绝大多数格就是 `""`。反过来它把**错误值本身**数成 `1`，所以「闸门
/// 该放行」的用例必须断言精确格数，不能只断言「不是错误」。
fn counta_of(sheet: &mut Sheet, addr: &str, inner: &str) -> Value {
    let src = format!("=COUNTA({inner})");
    assert!(sheet.set_formula(addr, &src), "set_formula failed: {src}");
    sheet.get_cell(addr)
}

/// 溢出锚点持有整个 `Value::Array`（WASM 边界才折成左上角），锚点格要单取左上角。
fn anchor(sheet: &Sheet, addr: &str) -> Value {
    match sheet.get_cell(addr) {
        Value::Array(a) => a.get(0, 0).cloned().unwrap_or(Value::Null),
        other => other,
    }
}

/// 把 `n` 个 `;` 接 `m` 个 `,` 放进 A1，返回「行 × 列」。
/// `n` 个行分隔符切出 n+1 行；最后一行是那 m 个逗号，切出 m+1 列。
fn seed_two_axis(sheet: &mut Sheet, row_delims: usize, col_delims: usize) {
    let text = format!("{}{}", ";".repeat(row_delims), ",".repeat(col_delims));
    sheet.set_cell("A1", Value::Text(text));
}

// === 二维分支：闸门 ===

/// 复现用例本身。2200 字符 → 1101 × 1101 = 1,212,201 格。
/// 修复前这里老老实实把 121 万格建出来并溢进表里。
#[test]
fn textsplit_2d_blowup_is_gated() {
    let mut sheet = Sheet::new();
    seed_two_axis(&mut sheet, 1100, 1100);
    assert!(sheet.set_formula("C1", "=TEXTSPLIT(A1,\",\",\";\")"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::InvalidValue));
}

/// 上限的两侧各一步，证明闸门钉在 `> CAP` 而不是别的地方。
/// 1023 个分隔符/轴 → 1024 × 1024 = 1,048,576 = CAP，必须**放行**；
/// 行轴多一个 → 1025 × 1024 = 1,049,600 > CAP，必须 `#VALUE!`。
#[test]
fn textsplit_cap_boundary_is_exactly_the_shared_constant() {
    let mut sheet = Sheet::new();
    seed_two_axis(&mut sheet, 1023, 1023);
    assert_eq!(
        counta_of(&mut sheet, "C1", "TEXTSPLIT(A1,\",\",\";\")"),
        Value::Number(f64::from(CAP)),
        "正好 CAP 格必须放行"
    );

    let mut sheet = Sheet::new();
    seed_two_axis(&mut sheet, 1024, 1023);
    assert!(sheet.set_formula("C1", "=TEXTSPLIT(A1,\",\",\";\")"));
    assert_eq!(
        sheet.get_cell("C1"),
        Value::Error(ValueError::InvalidValue),
        "CAP 之上必须 #VALUE!"
    );
}

/// 与 `SEQUENCE` 同码：这是「复用同一个闸门」的证据，不是巧合。
///
/// 拿来对照的是 `SEQUENCE(2000,2000)` 而不是 `SEQUENCE(CAP+1)`：后者行数越网格，
/// 会踩到那条未决分歧（TS 侧对越网格给 `#NUM!`），对照就不成立了。2000 × 2000
/// 两轴都在网格内、只有乘积越界，两个引擎都只能走纯格数那条路。
#[test]
fn textsplit_over_cap_matches_the_sequence_verdict() {
    let mut sheet = Sheet::new();
    seed_two_axis(&mut sheet, 1100, 1100);
    assert!(sheet.set_formula("C1", "=SEQUENCE(2000,2000)"));
    assert!(sheet.set_formula("C2", "=TEXTSPLIT(A1,\",\",\";\")"));
    let seq = sheet.get_cell("C1");
    assert_eq!(seq, Value::Error(ValueError::InvalidValue));
    assert_eq!(
        sheet.get_cell("C2"),
        seq,
        "TEXTSPLIT 必须与 SEQUENCE 给同一个码"
    );
}

/// 公式能造出的最坏情形：`REPT` 的 32767 字符上限打满、两轴对半分
/// → 16384 × 16384 = 268,435,456 格。闸门在任何大分配之前，所以这条应当
/// **秒回**；跑得慢或者 OOM 就说明闸门位置错了。
#[test]
fn textsplit_formula_reachable_worst_case_is_gated() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula(
        "C1",
        "=TEXTSPLIT(REPT(\";\",16383)&REPT(\",\",16383),\",\",\";\")"
    ));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::InvalidValue));
}

/// 只有**乘积**越界、两轴各自都在网格内（1101 行 / 1101 列都远小于
/// 1048576 / 16384）。这条走的是纯格数分支，与「超网格」那条未决分歧无关
/// —— 也就是说闸门不依赖任何关于网格边界的判断。
#[test]
fn textsplit_over_cap_by_product_only() {
    let mut sheet = Sheet::new();
    seed_two_axis(&mut sheet, 1100, 1100);
    assert!(sheet.set_formula("C1", "=TEXTSPLIT(A1,\",\",\";\")"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::InvalidValue));
}

/// 列数越网格、但格数没越：**照收，不判错**。
///
/// `row_delim` 一次都没匹配上 → 走的是二维分支，出来却是 1 × 20001。
/// 20001 > 16384（网格列数），但只有 20001 格，远在上限之下。TS 侧
/// `array.ts` 的 `tooLarge()` 在这里会判错（它捎带行/列越网格两条），所以这条
/// 用例同时是「TS 侧为什么没复用那个 helper」的可执行理由 —— 复用了就在这里
/// 新造一条跨引擎分歧。
#[test]
fn textsplit_wide_but_small_result_is_accepted() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Text(",".repeat(20_000)));
    assert_eq!(
        counta_of(&mut sheet, "C1", "TEXTSPLIT(A1,\",\",\";\")"),
        Value::Number(20_001.0),
    );
}

// === 1×N 分支：刻意没有闸门 ===

/// 32767 个逗号 → 1 × 32768，远在上限之下，必须原样放行。
/// 断言精确格数而不是「不是错误」：`COUNTA` 对错误值也回 1。
#[test]
fn textsplit_one_axis_is_not_gated() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Text(",".repeat(32767)));
    assert_eq!(
        counta_of(&mut sheet, "C1", "TEXTSPLIT(A1,\",\")"),
        Value::Number(32768.0),
    );
}

/// 1×N 的线性性不止于「公式造得出的最长文本」：宿主直接塞进来的超长文本也只
/// 换来线性的格数。30 万个行分隔符 + 缺席的列分隔符 → 300001 × 1，仍在上限内，
/// 必须放行 —— 闸门只砍二次爆炸，不砍线性结果。
#[test]
fn textsplit_host_injected_long_text_stays_linear() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Text(";".repeat(300_000)));
    assert_eq!(
        counta_of(&mut sheet, "C1", "TEXTSPLIT(A1,\",\",\";\")"),
        Value::Number(300_001.0),
    );
}

// === 回归护栏 ===

/// 闸门不能误伤正常用法：TEXTSPLIT 的既有语义一个字都没变。
#[test]
fn ordinary_textsplit_is_unaffected() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Text("a,b;c,d".to_string()));
    assert!(sheet.set_formula("C1", "=TEXTSPLIT(A1,\",\",\";\")"));
    assert_eq!(anchor(&sheet, "C1"), Value::Text("a".to_string()));
    assert_eq!(sheet.get_cell("D1"), Value::Text("b".to_string()));
    assert_eq!(sheet.get_cell("C2"), Value::Text("c".to_string()));
    assert_eq!(sheet.get_cell("D2"), Value::Text("d".to_string()));

    // 参差行补 pad（默认 `#N/A`）—— 补齐正是闸门要数的那一步。
    sheet.set_cell("A2", Value::Text("a;b,c".to_string()));
    assert!(sheet.set_formula("F1", "=TEXTSPLIT(A2,\",\",\";\")"));
    assert_eq!(anchor(&sheet, "F1"), Value::Text("a".to_string()));
    assert_eq!(sheet.get_cell("G1"), Value::Error(ValueError::NotAvailable));
    assert_eq!(sheet.get_cell("F2"), Value::Text("b".to_string()));
    assert_eq!(sheet.get_cell("G2"), Value::Text("c".to_string()));
}

/// `col_delim` 是必填的。修复前只挡了 `args.is_empty()`，`=TEXTSPLIT("a")`
/// 走到 `&args[1]` **panic**（index out of bounds），在 WASM 里没有 unwinding
/// —— 与格数闸门缺失同一类后果：一条公式打死 worker。
/// TS 参考引擎判的是 `args.length < 2` → `#VALUE!`，`WrongArgCount` 经
/// `format.rs` 也渲染成 `#VALUE!`，两侧同码。
#[test]
fn textsplit_missing_col_delim_is_an_error_not_a_panic() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=TEXTSPLIT(\"a\")"));
    assert_eq!(
        sheet.get_cell("A1"),
        Value::Error(ValueError::WrongArgCount)
    );
}
