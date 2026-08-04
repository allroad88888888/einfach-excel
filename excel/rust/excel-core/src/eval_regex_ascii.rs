//! 把模式里的 `\d \D \w \W \s \S \b \B` 从 Unicode 口径改写成 **ASCII 口径**。
//!
//! 为什么需要这一步：Excel 的 REGEX* 三函数用 **PCRE2** 方言（微软官方文档
//! 三处明写），而 PCRE2 的 Unicode 口径由**唯一一个** `PCRE2_UCP` 开关控制，
//! 它同时改写 `\d`、`\s`、`\w` 三者 —— 不开时三者一律只认 ASCII，开了三者
//! 一起走 Unicode 属性。`pcre2unicode(3)`：不开 UCP 时“the characters that
//! PCRE2 recognizes as digits, spaces, or word characters remain the same set
//! as in non-UTF mode, all with code points less than 256”。
//!
//! 10.43 起有 `PCRE2_EXTRA_ASCII_BSD/BSS/BSW` 可以在 UCP 打开时把**个别**转义
//! 单独摁回 ASCII，但方向是单向的：它们只能**减** Unicode，不能在 UCP 关着时
//! 给某一个转义**加** Unicode（实测 `pcre2test 10.47`：`/^\d$/utf,ascii_bsd`
//! 对 `٥` 仍然 No match，即无 UCP 时该选项是空操作）。所以「`\d` 是 ASCII 而
//! `\s` 是 Unicode」这个组合在 PCRE2 里够不到，除非刻意配成
//! UCP + ASCII_BSD + ASCII_BSW 却偏偏不加 ASCII_BSS。**结论：`\d` 与 `\s` 的
//! ASCII/Unicode 极性必然同进同退**，本仓既然已经按 ASCII 口径钉死了 `\d`
//! / `\w`，`\s` 就没有留在 Unicode 的余地。
//!
//! 三方实测（`pcre2test 10.47` / node / `regex 1.12.3`，见
//! `tests/regex_dialect_parity.rs` 顶部的表）：`\s` 在 PCRE2 默认下就是
//! `[\t\n\x0B\x0C\r\x20]` 这六个码点，而 Rust 的 `regex` 走 Unicode
//! `White_Space`、JS 的 `RegExp` 走 ECMAScript `WhiteSpace`+`LineTerminator`。
//! 后两者**并不相等**：U+0085(NEL) 只有 Rust 算空白，U+FEFF(ZWNBSP) 只有 JS
//! 算空白。也就是说改之前两个引擎在 `\s` 上**本来就有分歧**，把两边一起拉到
//! ASCII 是消除分歧，不是制造分歧。TS 侧的对称改写在
//! `excel/excel-core-ts/src/eval/functions/regex-ascii.ts`。
//!
//! 与 `eval_regex_cache.rs` 分开：那边管“编译结果的缓存与淘汰”，这边管
//! “送进编译器之前模式长什么样”，是两件事。改写只在缓存未命中时跑一次，
//! 缓存键仍然是**原始**模式。

use std::borrow::Cow;

/// PCRE2 不开 `PCRE2_UCP` 时 `\s` 认的全部码点：HT LF VT FF CR SP。
///
/// 写成字符类**主体**（不含方括号），四个改写分支各自套上自己的框：肯定形态
/// `[…]`、否定形态 `[^…]`。这样这六个码点在源码里只出现一次，`\s` 与 `\S`
/// 互为补集是构造保证而不是靠两处手写对齐。
///
/// 每个码点都用转义而非字面量 —— 尤其空格必须写 `\x20`：用户模式里可能有
/// `(?x)`（扩展模式），那会让字符类里的**字面**空格被忽略，`[\s]` 就悄悄漏掉
/// 空格本身（实测 `(?x)^[ \t]$` 对 `" "` 是 false，`(?x)^[\x20\t]$` 才是 true）。
const ASCII_SPACE_BODY: &str = r"\t\n\x0B\x0C\r\x20";

/// 若 `rest`（紧跟在类内 `[` 之后的剩余串）以 POSIX 类名 `:name:]` 开头，
/// 返回该段的字节长度。
///
/// 存在的理由是 `[[:alpha:]]` 里那个内层 `[` **不**开启一层嵌套 —— 它属于
/// `[:alpha:]` 这个整体记号。不认出来就会把随后的 `:]` 当成闭合括号，深度
/// 计数从此偏移一位，后面的 `\d` 就会被当成类外的用错分支。
fn posix_class_run(rest: &str) -> Option<usize> {
    let body = rest.strip_prefix(':')?;
    let end = body.find(":]")?;
    // 类名只有 ASCII 字母，外加取反形式 `[:^alpha:]` 的前导 `^`。
    if body[..end].chars().all(|c| c.is_ascii_alphabetic() || c == '^') {
        Some(1 + end + 2)
    } else {
        None
    }
}

/// 改写 `pattern`，返回可直接交给 `regex::Regex::new` 的模式。
///
/// 展开形式分两族，按转义出现在**字符类内还是类外**决定：
///
/// * **类外**。`\d` / `\w` / `\b` / `\B` → `(?-u:…)`：`regex` 允许把 Unicode
///   模式局部关掉，且这四个在 ASCII 下都不可能匹配到非法 UTF-8，编译得过。
///   用作用域组而不是在整条模式前加 `(?-u)`，是因为后者会把 `.`、以及所有
///   否定字符类一起拖进字节模式，`(?-u).` 直接编译失败（实测）。
///   `\D` / `\W` / `\S` 走不了这条路：`(?-u:\D)` 能匹配 0x80–0xFF 单字节即
///   非法 UTF-8，`regex` 拒绝编译（实测三个都拒），所以写成保留 Unicode 模式
///   的显式否定类 `[^0-9]` / `[^0-9A-Za-z_]` / `[^…空白…]`。
/// * **类内**。作用域组塞不进字符类（`[(?-u:\d)]` 会被当成一堆字面字符），
///   改用 `regex` 支持的**嵌套字符类**：`[\d-x]` → `[[0-9]-x]`。
///
/// 类内**刻意不摊平成裸区间**（早先的 `\d` → `0-9`、`\w` → `0-9A-Za-z_`）：
/// 摊平会让展开尾字符和后面的 `-` 拼出**假区间**。`[\w-x]` 摊平成
/// `[0-9A-Za-z_-x]`，其中 `_-x` 是 U+005F..U+0078 的区间，于是反引号 `` ` ``
/// 被误收、真正想要的字面 `-` 反而丢了 —— 实测 JS 给 `` ` ``=false / `-`=true，
/// 摊平版给 `` ` ``=true / `-`=false，两边全反。嵌套类没有这个问题，因为嵌套
/// 类不能充当区间端点，后面的 `-` 只能是字面量（实测 `[[0-9A-Za-z_]-x]` 与 JS
/// 逐条一致）。`\s` 的展开尾字符是 `\x20`，同样的坑，所以四个肯定形态统一用
/// 嵌套类。
///
/// `\W` 在类外额外裹一层 `(?-i:…)`：`compile_regex` 的大小写不敏感是靠前缀
/// `(?i)` 实现的，而 `regex` 的 `(?i)` 会对 `[A-Za-z]` 做 **Unicode** 折叠，
/// 把开尔文记号 U+212A、长 s U+017F 折进 `A-Za-z`，否定之后反而把它们排除；
/// JS 的 `i`（无 `u` 标志）不会把非 ASCII 折到 ASCII，两者会分叉。`\S` **不**
/// 需要这层：它的字符类里一个有大小写的字母都没有，没有可折的东西 —— 这是
/// 穷举全部 0x0..0x10FFFF 码点比对 `(?i)[^…]` 与 `(?i)(?-i:[^…])` 得到 0 处
/// 差异的实测结论，不是推理。类内那两个裹不了作用域组，这一角保持已知偏差。
pub(super) fn to_ascii_classes(pattern: &str) -> Cow<'_, str> {
    // 没有反斜杠就没有 `\d` 一族，直接借用，热路径不付分配。
    if !pattern.contains('\\') {
        return Cow::Borrowed(pattern);
    }
    let mut out = String::with_capacity(pattern.len() + 16);
    // 字符类的**嵌套深度**，不是布尔量：`regex` 支持 `[[0-9]a]` 这种嵌套类，
    // 用布尔量会在内层 `]` 上提前判定“出类了”，随后的 `\d` 就会走类外分支，
    // 生成 `[[0-9](?-u:\d)]` —— 那是个语义完全不同的模式（实测原模式对 "a"
    // 是 false，改写后变成 true）。
    let mut depth = 0usize;
    let mut chars = pattern.chars();
    while let Some(ch) = chars.next() {
        match ch {
            '\\' => {
                let Some(esc) = chars.next() else {
                    // 尾部孤立反斜杠：原样交给编译器去报错。
                    out.push('\\');
                    break;
                };
                let in_class = depth > 0;
                match (in_class, esc) {
                    (false, 'd') => out.push_str("(?-u:\\d)"),
                    (false, 'w') => out.push_str("(?-u:\\w)"),
                    (false, 'b') => out.push_str("(?-u:\\b)"),
                    (false, 'B') => out.push_str("(?-u:\\B)"),
                    (false, 'D') => out.push_str("[^0-9]"),
                    (false, 'W') => out.push_str("(?-i:[^0-9A-Za-z_])"),
                    (true, 'd') => out.push_str("[0-9]"),
                    (true, 'w') => out.push_str("[0-9A-Za-z_]"),
                    (true, 'D') => out.push_str("[^0-9]"),
                    (true, 'W') => out.push_str("[^0-9A-Za-z_]"),
                    (_, 's') => {
                        out.push('[');
                        out.push_str(ASCII_SPACE_BODY);
                        out.push(']');
                    }
                    (_, 'S') => {
                        out.push_str("[^");
                        out.push_str(ASCII_SPACE_BODY);
                        out.push(']');
                    }
                    // 其余转义（含 `\\`、`\.`）原样透传。注意 `\\` 正是靠这条
                    // 分支保住语义：`\\s` 是“字面反斜杠 + 字面 s”，两个字符在
                    // 这里被一次性吐回，循环下一轮看到的 `s` 只是普通字符，
                    // 不会被误当成 `\s` 改写。
                    _ => {
                        out.push('\\');
                        out.push(esc);
                    }
                }
            }
            '[' => {
                // 类内的 `[` 可能是 POSIX 记号 `[:alpha:]` 的开头，那不算一层
                // 嵌套；整段原样搬走，深度不动。
                if depth > 0 {
                    let rest = chars.as_str();
                    if let Some(n) = posix_class_run(rest) {
                        out.push('[');
                        out.push_str(&rest[..n]);
                        chars = rest[n..].chars();
                        continue;
                    }
                }
                depth += 1;
                out.push('[');
            }
            ']' if depth > 0 => {
                depth -= 1;
                out.push(']');
            }
            _ => out.push(ch),
        }
    }
    Cow::Owned(out)
}
