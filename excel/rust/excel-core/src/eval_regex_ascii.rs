//! 把模式里的 `\d \D \w \W \b \B` 从 Unicode 口径改写成 **ASCII 口径**。
//!
//! 为什么需要这一步：Excel 的 REGEX* 三函数用 **PCRE2** 方言（微软官方文档
//! 三处明写），而 PCRE2 在**不开 `PCRE2_UCP`** 时 `\d` / `\w` 只认 ASCII
//! （`pcre2unicode(3)`：“By default, \d, \s, and \w match only ASCII
//! characters, even in UTF-8 mode”）。TS 引擎用 JS `RegExp`，`\d` / `\w`
//! 天生就是 ASCII，正好落在同一口径上。
//!
//! 只有 Rust 的 `regex` crate 是例外：它默认 Unicode 感知，`\d` 认阿拉伯-印度
//! 数字 `٥`、`\w` 认 `é`。于是同一份工作簿 `=REGEXTEST("٥","\d")` 在 TS 后端
//! 是 FALSE、在 WASM 后端是 TRUE —— **两边都不报错，各算各的**，是最坏的那类
//! 分歧。本模块把 Rust 侧拉到 ASCII，三方（Excel / TS / Rust）就此对齐。
//!
//! 与 `eval_regex_cache.rs` 分开：那边管“编译结果的缓存与淘汰”，这边管
//! “送进编译器之前模式长什么样”，是两件事。改写只在缓存未命中时跑一次，
//! 缓存键仍然是**原始**模式。
//!
//! **`\s` / `\S` 刻意不改**：JS 的 `\s` 本身就是 Unicode 感知的（NBSP、
//! U+2028 都算空白），和 Rust 一致；PCRE2 默认则是 ASCII。三方里恰好是
//! 两个引擎彼此一致、共同偏离 Excel。改 Rust 会**制造**一条新的双引擎分歧，
//! 所以维持现状并记录在案，而不是单边动手。

use std::borrow::Cow;

/// 改写 `pattern`，返回可直接交给 `regex::Regex::new` 的模式。
///
/// 三种展开形式各有原因：
///
/// * `\d` / `\w` / `\b` / `\B` → `(?-u:…)`。`regex` 允许把 Unicode 模式
///   局部关掉，且这四个在 ASCII 下都不可能匹配到非法 UTF-8，编译得过。
///   用作用域组而不是在整条模式前加 `(?-u)`，是因为后者会把 `.`、以及所有
///   否定字符类一起拖进字节模式，`(?-u).` 直接编译失败（实测）。
/// * `\D` / `\W` → 显式否定类。`(?-u:\D)` 会匹配 0x80–0xFF 单字节即非法
///   UTF-8，`regex` 拒绝编译（实测），所以只能写成保留 Unicode 模式的
///   `[^0-9]` / `[^0-9A-Za-z_]`。
/// * 字符类**内部**（`[\d-]`）不能塞作用域组 —— `[(?-u:\d)]` 会被当成一堆
///   字面字符 —— 所以摊平成 `0-9` / `0-9A-Za-z_`，否定的两个则借
///   `regex` 支持的嵌套类写成 `[[^0-9]…]`。
///
/// `\W` 在类外额外裹一层 `(?-i:…)`：`compile_regex` 的大小写不敏感是靠前缀
/// `(?i)` 实现的，而 `regex` 的 `(?i)` 会对 `[A-Za-z]` 做 **Unicode** 折叠，
/// 把开尔文记号 U+212A、长 s U+017F 折进 `A-Za-z`，否定之后反而把它们排除；
/// JS 的 `i`（无 `u` 标志）不会把非 ASCII 折到 ASCII，两者会分叉。类内那两个
/// 裹不了作用域组，这一角保持已知偏差。
pub(super) fn to_ascii_classes(pattern: &str) -> Cow<'_, str> {
    // 没有反斜杠就没有 `\d` 一族，直接借用，热路径不付分配。
    if !pattern.contains('\\') {
        return Cow::Borrowed(pattern);
    }
    let mut out = String::with_capacity(pattern.len() + 16);
    // 状态机只需要知道“当前在不在字符类里”。`\` 转义下一个字符，`[` 开类，
    // `]` 闭类 —— 与 `regex` 自己的解析一致（它同样不认 POSIX 那种“`]` 紧跟
    // `[` 算字面量”的写法），所以两边对边界的判断不会错位。
    let mut in_class = false;
    let mut chars = pattern.chars();
    while let Some(ch) = chars.next() {
        match ch {
            '\\' => {
                let Some(esc) = chars.next() else {
                    // 尾部孤立反斜杠：原样交给编译器去报错。
                    out.push('\\');
                    break;
                };
                match (in_class, esc) {
                    (false, 'd') => out.push_str("(?-u:\\d)"),
                    (false, 'w') => out.push_str("(?-u:\\w)"),
                    (false, 'b') => out.push_str("(?-u:\\b)"),
                    (false, 'B') => out.push_str("(?-u:\\B)"),
                    (false, 'D') => out.push_str("[^0-9]"),
                    (false, 'W') => out.push_str("(?-i:[^0-9A-Za-z_])"),
                    (true, 'd') => out.push_str("0-9"),
                    (true, 'w') => out.push_str("0-9A-Za-z_"),
                    (true, 'D') => out.push_str("[^0-9]"),
                    (true, 'W') => out.push_str("[^0-9A-Za-z_]"),
                    // 其余转义（含 `\\`、`\s`、`\.`）原样透传。
                    _ => {
                        out.push('\\');
                        out.push(esc);
                    }
                }
            }
            '[' if !in_class => {
                in_class = true;
                out.push('[');
            }
            ']' if in_class => {
                in_class = false;
                out.push(']');
            }
            _ => out.push(ch),
        }
    }
    Cow::Owned(out)
}
