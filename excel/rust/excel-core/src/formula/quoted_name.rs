//! 带引号表名的引号规则：`'My Sheet'!A1` 里那对引号怎么读、怎么写。
//!
//! 读与写是同一条规则的两面，所以住同一个文件：读的一半把 `''` 解成一个
//! `'`、把引号剥掉；写的一半反过来 —— 表名裸写回不去时补上引号，名字里的
//! `'` 加倍。两半分家过就会漂移（写出来的文本读不回同一棵树），这里不给它
//! 分家的机会。
//!
//! **判据是「本解析器能不能原样吃回来」，不是「Excel 好不好看」**。
//! [`is_bare_sheet_name`] 逐条对齐 `primary` 的首字符分流与 `identifier`
//! 的标识符扫描；这两处一变，这里必须跟着变，`quoted_sheet_name_tests.rs`
//! 里的往返用例是它们的联结点。

use super::ast::Expr;
use super::lexer::Parser;

impl Parser {
    /// `parse_primary` 的 `'` 分支：带引号表名开头的引用。
    ///
    /// `!` 必须**紧跟**在闭合引号之后（不吃中间空白），与 TS 侧
    /// `tokenizer.ts` 的 `src[r.next] === '!'` 同口径。不跟 `!` 时退回一个
    /// 普通 `Expr::Name` —— 也是照搬 TS 的兜底（它的注释：keeps the
    /// tokenizer total），求值时按未绑定名字给 `#NAME?`，而不是让整条公式
    /// 变成 `#VALUE!`。
    pub(super) fn parse_quoted_primary(&mut self) -> Option<Expr> {
        let name = self.scan_quoted_name()?;
        if self.peek() == Some('!') {
            self.advance();
            // `!` 之后的尾巴与不带引号的跨表引用**完全同一族语法**，所以直接
            // 交给同一个收尾函数 —— 单格 / 有界区间 / 整列 / 整行 / 动态右角
            // 一条都不用在这里重写。带引号与不带引号的差别只在「表名怎么取」。
            return self.finish_sheet_qualified_ref(name);
        }
        Some(Expr::Name(name))
    }

    /// 读一个 `'…'` 名字，游标停在闭合引号之后，返回**解转义后**的名字。
    ///
    /// `''` 是转义的单引号：`'It''s'` → `It's`。引号内不做任何其它解释 ——
    /// 空格、`!`、`:`、非 ASCII 全部原样进名字。**表名里的 `!` 因此不产生
    /// 歧义**：分隔符是闭合引号之后的那个 `!`，扫描根本不看引号内的 `!`。
    ///
    /// 引号未闭合返回 `None` 且**不回卷**位置 —— 调用方一律就此让整条公式
    /// 解析失败（TS 侧同形，走 `tokenizer-error`）。
    fn scan_quoted_name(&mut self) -> Option<String> {
        self.advance(); // 开引号
        let mut out = String::new();
        loop {
            match self.advance()? {
                '\'' if self.peek() == Some('\'') => {
                    self.advance();
                    out.push('\'');
                }
                '\'' => return Some(out),
                c => out.push(c),
            }
        }
    }
}

/// 把表名写成 `Sheet!` 前缀的表名部分（**不含** `!`）：需要引号时加引号，
/// 名字里的 `'` 加倍。
///
/// 这是 [`Parser::scan_quoted_name`] 的逆：`push_sheet_name` 出来的文本再
/// 喂给解析器，必得回同一个表名。结构性编辑（插删行列）会把**所有**受影响
/// 的公式重渲染后写回源表，所以这里少加一个引号，用户的 `'My Sheet'!A1`
/// 就会在一次插行之后变成读不回来的 `My Sheet!A1`。
pub(crate) fn push_sheet_name(out: &mut String, name: &str) {
    if is_bare_sheet_name(name) {
        out.push_str(name);
        return;
    }
    out.push('\'');
    for ch in name.chars() {
        if ch == '\'' {
            out.push('\'');
        }
        out.push(ch);
    }
    out.push('\'');
}

/// 这个表名裸写回来还认得吗？认得才允许省掉引号。
///
/// 三条判据逐条对着解析器的现实（不是对着 Excel 的文档）：
///
/// 1. 首字符必须是 ASCII 字母 —— `primary::parse_primary` 只在
///    `c.is_ascii_alphabetic()` 时分流到 `parse_identifier`。所以 `_data`、
///    `2024Q1`、`销售数据` 都得加引号，哪怕 Excel 认得其中一部分。
/// 2. 其余字符只收 `[A-Za-z0-9_]`。**`.` 刻意不收**：`identifier` 只在「下
///    一个字符还是标识符字符」时才吃 `.`，于是 `Sheet.` 会被截断、`S..1` 会
///    被切两半。为一个纯装饰性的收益引入这种边界不值当 —— 加引号总是安全，
///    且 `'Sheet.1'!A1` 仍是合法 Excel 写法。
/// 3. `TRUE` / `FALSE` 要引号。`identifier` 的布尔字面量分支排在 `!` 分支
///    **之前**，裸写的 `TRUE!A1` 会先被吃成 `Expr::Bool` 再让 `!A1` 变成剩余
///    输入，整条公式解析失败。（TS 侧的 `!` 探测排在布尔之前，所以它认得裸写
///    的 `TRUE!A1` —— 这条不对称留在解析侧，渲染侧只管别踩。）
fn is_bare_sheet_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return false;
    }
    !name.eq_ignore_ascii_case("TRUE") && !name.eq_ignore_ascii_case("FALSE")
}

#[cfg(test)]
#[path = "quoted_name_tests.rs"]
mod tests;
