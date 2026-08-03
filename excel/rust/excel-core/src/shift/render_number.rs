//! 数字字面量渲染回公式源码时的写法选择：普通十进制，还是科学计数。

/// 数字字面量的普通（非科学计数）写法允许占的最大字符数，**不含符号**。
///
/// `20 = 2 ("0.") + 17 (f64 最短往返表示的有效数字上限, IEEE 754 binary64)` —
/// 也就是「把 17 位有效数字连同 `0.` 前缀全写出来」这一最坏情形的长度。任何
/// 长过它的普通写法，多出来的字符**必然是填充零**（`0.` 后面的前导零，或小数点
/// 前的拖尾零），而不是信息。所以这条阈值的意思是：**只在开始写填充零时才退到
/// 科学计数**，不早不晚。
///
/// 副产品：这个界正好复现 Excel General 的两个切换点 —— `1E19` 写成
/// `10000000000000000000`（20 字符，留），`1E20` 退到科学计数（21 字符）；
/// `1E-18` 写成 `0.000000000000000001`（20 字符，留），`1E-19` 退（21 字符）。
/// 与 `general_text.rs` 的 `MAX_TEXT_LEN` 数值相同**属于同源不同证**：那边 20 是
/// Excel 的显示缓冲宽度，这边 20 是上面那个 `2 + 17` 的推导。改动其一不必跟着
/// 改另一个。
const MAX_PLAIN_LITERAL_LEN: usize = 20;

/// 把一个数字字面量渲染回公式源码。
///
/// # 为什么**不**复用 `general_text::excel_general_to_text`
///
/// 那份是 Excel「General」**显示**规格，按定义只保留 15 位有效数字并做 half-up
/// 收位（`=0.1+0.2` 显示成 `0.3`）。公式文本不是显示，是**源码**：
/// `render_formula` 的输出会被 `sheet.rs` / `workbook.rs` 写回公式源表，成为
/// 下一次解析的输入。用显示规格渲染源码 = 每次插删行列都把用户的
/// `=0.30000000000000004` 悄悄改成 `=0.3`，那是**改数据**，不是改写法。
///
/// Excel 自己确实两处共用一份转换（Apache POI 的 `NumberPtg.toFormulaString()`
/// 委托给 `NumberToTextConverter.toText()`，其 javadoc 原文是 "the text
/// representation that Excel would give if the value were to appear in an
/// unformatted cell, **or as a literal number in a formula**"），并且明说
/// "Excel's text to number conversion is not a true inverse of this operation"
/// —— 也就是 Excel 的公式字面量渲染是**不保证往返**的。Excel 敢这么做是因为
/// 它的结构性编辑**根本不重新渲染公式**：`tNum` ptg 里存的就是 8 字节 double，
/// 插删行列只搬引用 token，那个有损字符串只是公式栏上的一层显示。本引擎的
/// `Expr::Number` 走的是「重渲染回文本再存回去」，同一个有损规格在这里是持久化
/// 的数据损失。规格相同、位置不同，所以结论相反。
///
/// 于是这里的口径是：**数字一位不改（`{}` / `{:e}` 都是最短往返表示），只挑
/// 写法**。
pub(super) fn render_number(n: f64, out: &mut String) {
    if n == n.floor() && n.abs() < 1e15 {
        out.push_str(&format!("{}", n as i64));
        return;
    }
    // `{}` 对 f64 是「最短往返」的十进制展开，且**从不**用科学计数：`1E-300`
    // 会摊成 302 个字符。值没错，但公式文本从 8 字符涨到 302。
    let plain = format!("{n}");
    let unsigned_len = plain.len() - usize::from(plain.starts_with('-'));
    if unsigned_len <= MAX_PLAIN_LITERAL_LEN {
        out.push_str(&plain);
        return;
    }
    // `{:e}` 同样是最短往返表示，只是带指数；大写 `E` 与本引擎词法一致
    // （`=1E-300` 能原样解析回同一个 f64）。
    out.push_str(&format!("{n:e}").to_uppercase());
}
