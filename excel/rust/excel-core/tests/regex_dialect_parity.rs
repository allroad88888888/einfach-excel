//! REGEX* 方言口径的**跨引擎钉子**（Rust 半边）。
//!
//! 对称的另一半是 `excel/excel-core-ts/test/regex-dialect.test.ts`，两个文件
//! 逐条对应、断言同一批可观察结果。**没有走 `cross-engine-parity-*` 那张网**：
//! 那张网的 WASM 侧加载的是 `excel/solid-excel/wasm-pkg/`，即 **lite** 构建，
//! 而 REGEX* 受 `regex-formulas` feature 门控，lite 下这三个名字根本不是内建，
//! 一律求值成 `#NAME?`（见 `excel/rust/wasm/README.md`「两份产物」）。把 REGEX*
//! 塞进去只会得到一整屏 `#NAME?` 对 `#VALUE!` 的假分歧。改成两侧各钉一份是既有
//! 先例（自定义公式的数组回程同样这么办）。
//!
//! 口径的依据：Excel 的三个 REGEX* 函数用 **PCRE2** 方言（微软 support 文档在
//! 三个函数页各写了一遍：“use the PCRE2 'flavor' of regex”），而 PCRE2 不开
//! `PCRE2_UCP` 时 `\d`/`\s`/`\w` 只认 ASCII。改写实现见
//! `excel/rust/excel-core/src/eval_regex_ascii.rs`。
//!
//! `\s` 的三方实测（`pcre2test 10.47` / node 24 / `regex 1.12.3`，T=算空白）：
//!
//! | 码点 | PCRE2 默认 | PCRE2 `ucp` | JS `RegExp` | Rust `regex` |
//! |---|---|---|---|---|
//! | U+0009 HT / U+000A LF / U+000D CR / U+0020 SP | T | T | T | T |
//! | U+000B VT / U+000C FF | T | T | T | T |
//! | U+0085 NEL | **F** | T | **F** | **T** |
//! | U+00A0 NBSP | **F** | T | T | T |
//! | U+2028 LS / U+2029 PS | **F** | T | T | T |
//! | U+3000 全角空格 | **F** | T | T | T |
//! | U+FEFF ZWNBSP | **F** | **F** | **T** | **F** |
//!
//! 两条要点：(1) PCRE2 默认那一列就是 `[\t\n\x0B\x0C\r\x20]` 六个码点；
//! (2) 改之前 JS 与 Rust 在 U+0085 和 U+FEFF 上**本来就不一致**，所以把两边
//! 一起拉到 ASCII 是**消除**分歧，不是制造分歧。
//!
//! 为什么敢断定 Excel 那一栏是「PCRE2 默认」而不是「`ucp`」：`PCRE2_UCP` 是
//! **一个**开关，同时管 `\d`/`\s`/`\w`。10.43 起的 `PCRE2_EXTRA_ASCII_BSD/BSS/BSW`
//! 只能在 UCP 开着时把个别转义**摁回** ASCII，方向单向（实测 `pcre2test`：
//! `/^\d$/utf,ascii_bsd` 不开 `ucp` 时对 `٥` 仍 No match，即该选项是空操作）。
//! 于是「`\d` ASCII + `\s` Unicode」这个组合在 PCRE2 里够不到，除非刻意配成
//! UCP + ASCII_BSD + ASCII_BSW 却偏不加 ASCII_BSS。本仓已按 ASCII 钉死 `\d`
//! / `\w`，`\s` 只能同极性。**这两件事的证据强度是同一份**：微软没有文档化
//! UCP 位，若 `\d` 那条判断错了，`\s` 会跟着一起错 —— 它们不会各错各的。

#![cfg(feature = "regex-formulas")]

use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::Workbook;

/// 求值一条公式，返回单元格值。
fn ev(formula: &str) -> Value {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "A1", formula), "set_formula failed: {}", formula);
    wb.get_cell("Sheet1", "A1")
}

fn text(s: &str) -> Value {
    Value::Text(s.into())
}

// --- `\d` / `\w` / `\b` 是 ASCII 口径 ---------------------------------------

/// `\d` 只认 ASCII 0-9。阿拉伯-印度数字 `٥`(U+0665) 与全角 `５`(U+FF15) 都不算。
///
/// 这是本轮修掉的**最坏一类分歧**：改之前 Rust 的 `regex` crate 默认 Unicode
/// 感知，这三个断言在 WASM 后端全是 TRUE、在 TS 后端全是 FALSE —— 两边都不
/// 报错，同一份工作簿静默算出两个答案。
#[test]
fn digit_class_is_ascii_only() {
    assert_eq!(ev("=REGEXTEST(\"5\", \"^\\d$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{0665}\", \"^\\d$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\u{FF15}\", \"^\\d$\")"), Value::Boolean(false));
}

/// `\w` 只认 ASCII 字母数字下划线；带音标的 `é` 不算词字符。
#[test]
fn word_class_is_ascii_only() {
    assert_eq!(ev("=REGEXTEST(\"a\", \"^\\w$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"_\", \"^\\w$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{00e9}\", \"^\\w$\")"), Value::Boolean(false));
}

/// 否定形态必须是肯定形态的补集。`\D`/`\W` 若还留在 Unicode 口径，
/// `\d` 与 `\D` 就会同时对 `٥` 说“不是我的”，模式作者拿到自相矛盾的引擎。
#[test]
fn negated_classes_are_the_complement_of_the_ascii_ones() {
    assert_eq!(ev("=REGEXTEST(\"\u{0665}\", \"^\\D$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"5\", \"^\\D$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\u{00e9}\", \"^\\W$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"a\", \"^\\W$\")"), Value::Boolean(false));
}

/// `\W` 叠上大小写不敏感（第 3/5 个参数）时仍要和 JS 一致。
///
/// 这条不是理论顾虑：`compile_regex` 的大小写不敏感是加前缀 `(?i)` 实现的，
/// 而 `regex` 的 `(?i)` 对 `[A-Za-z]` 做 **Unicode** 折叠，会把开尔文记号
/// U+212A、长 s U+017F 折进去，否定之后反而把它们排除；JS 的 `i`（无 `u`
/// 标志）不会把非 ASCII 折到 ASCII，两者会分叉。改写因此给类外的 `\W` 裹了
/// 一层 `(?-i:…)`。实测：不裹时 Rust 两个都是 false，JS 两个都是 true。
#[test]
fn negated_word_class_survives_case_insensitivity() {
    assert_eq!(ev("=REGEXTEST(\"\u{212A}\", \"^\\W$\", 1)"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{017F}\", \"^\\W$\", 1)"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"a\", \"^\\W$\", 1)"), Value::Boolean(false));
}

/// 字符类**内部**的 `\d`/`\w` 走的是另一条改写分支（摊平成区间而非作用域组），
/// 单独钉一遍，否则类内口径能悄悄漂回 Unicode。
#[test]
fn classes_inside_a_character_class_are_ascii_too() {
    assert_eq!(ev("=REGEXTEST(\"\u{0665}\", \"^[\\d]$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"7\", \"^[\\d]$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"-\", \"^[\\d-]$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{00e9}\", \"^[\\w]$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\u{0665}\", \"^[\\Dx]$\")"), Value::Boolean(true));
}

/// 词边界跟着 `\w` 的口径走。`é` 不是词字符，所以它前面没有词边界。
#[test]
fn word_boundary_follows_the_ascii_word_class() {
    assert_eq!(ev("=REGEXTEST(\"\u{00e9}\", \"\\b\u{00e9}\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"ab\", \"\\bab\\b\")"), Value::Boolean(true));
}

/// `\s` 只认 PCRE2 默认的六个 ASCII 空白。NBSP / 全角空格 / 行分隔符都不算 ——
/// 它们在 `regex` crate 的 Unicode `White_Space` 里算，所以这条是改写的功劳。
#[test]
fn whitespace_class_is_ascii_only() {
    for c in ['\u{0009}', '\u{000a}', '\u{000b}', '\u{000c}', '\u{000d}', '\u{0020}'] {
        assert_eq!(ev(&format!("=REGEXTEST(\"{}\", \"^\\s$\")", c)), Value::Boolean(true), "U+{:04X}", c as u32);
    }
    for c in ['\u{0085}', '\u{00a0}', '\u{1680}', '\u{2028}', '\u{2029}', '\u{202f}', '\u{3000}'] {
        assert_eq!(ev(&format!("=REGEXTEST(\"{}\", \"^\\s$\")", c)), Value::Boolean(false), "U+{:04X}", c as u32);
    }
}

/// `\S` 必须是 `\s` 的补集。留在 Unicode 口径的话，NBSP 会同时被 `\s` 和 `\S`
/// 拒绝，模式作者拿到自相矛盾的引擎。
#[test]
fn negated_whitespace_is_the_complement_of_the_ascii_one() {
    assert_eq!(ev("=REGEXTEST(\"\u{00a0}\", \"^\\S$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{3000}\", \"^\\S$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{0085}\", \"^\\S$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\" \", \"^\\S$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\u{000b}\", \"^\\S$\")"), Value::Boolean(false));
}

/// `\s` 叠上大小写不敏感不能漂。`\W` 那条曾经因为 `(?i)` 的 Unicode 折叠翻车，
/// `\s` 的字符类里没有带大小写的字母，所以不需要 `(?-i:)` 包裹 —— 这条钉住
/// 「不需要」这个结论，将来若展开形式变了会立刻被抓到。
#[test]
fn whitespace_class_survives_case_insensitivity() {
    assert_eq!(ev("=REGEXTEST(\" \", \"^\\s$\", 1)"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{00a0}\", \"^\\s$\", 1)"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\u{00a0}\", \"^\\S$\", 1)"), Value::Boolean(true));
}

/// 字符类**内部**的 `\s`/`\S` 走另一条改写分支（嵌套类而非作用域组）。
/// `[\s-x]` 这条同时钉住「展开不能拼出假区间」：`-` 必须是字面量，字母数字
/// 不能被捎进来。
#[test]
fn whitespace_classes_inside_a_character_class() {
    assert_eq!(ev("=REGEXTEST(\"\u{00a0}\", \"^[\\s]$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\" \", \"^[\\s]$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"\u{00a0}\", \"^[\\Sx]$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\" \", \"^[\\Sx]$\")"), Value::Boolean(false));
    // 假区间的钉子：`\x20-x` 若成了区间，`a` 和 `5` 会被误收。
    for (subject, expected) in [(" ", true), ("-", true), ("x", true), ("a", false), ("5", false)] {
        assert_eq!(
            ev(&format!("=REGEXTEST(\"{}\", \"^[\\s-x]$\")", subject)),
            Value::Boolean(expected),
            "subject {:?}",
            subject
        );
    }
}

/// 转义后的**字面反斜杠**不能被当成字符类：`\\s` 是「反斜杠 + 字母 s」两个
/// 字符，不是空白类。改写器若在这里错一步，`\\` 之后的每个字母都会被误改写。
#[test]
fn an_escaped_backslash_is_not_a_class() {
    assert_eq!(ev("=REGEXTEST(\"\\s\", \"^\\\\s$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\" \", \"^\\\\s$\")"), Value::Boolean(false));
    assert_eq!(ev("=REGEXTEST(\"\\d\", \"^\\\\d$\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"5\", \"^\\\\d$\")"), Value::Boolean(false));
}

// --- 错误码 -----------------------------------------------------------------

/// 「没匹配上」是 `#N/A`，「模式非法」是 `#VALUE!` —— 两者不能混。
/// REGEXEXTRACT 三种 return_mode 各自都要给 `#N/A`。
#[test]
fn no_match_is_na_and_bad_pattern_is_value() {
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"[0-9]+\")"), Value::Error(ValueError::NotAvailable));
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"[0-9]+\", 1)"), Value::Error(ValueError::NotAvailable));
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"([0-9])\", 2)"), Value::Error(ValueError::NotAvailable));
    // 匹配上了但模式里没有捕获组 → mode 2 无组可返回，同样 `#N/A`。
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"b\", 2)"), Value::Error(ValueError::NotAvailable));
    // 非法模式 → `#VALUE!`（不是 `#N/A`）。
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"[\")"), Value::Error(ValueError::InvalidValue));
    assert_eq!(ev("=REGEXTEST(\"abc\", \"[\")"), Value::Error(ValueError::InvalidValue));
    // 非法 return_mode 是参数问题，仍然 `#VALUE!`。
    assert_eq!(ev("=REGEXEXTRACT(\"abc\", \"b\", 3)"), Value::Error(ValueError::InvalidValue));
}

/// **已知分歧，钉住而不是修掉**：`regex` crate 是 RE2 血统，没有反向引用、
/// 没有 lookaround，这两类模式一律编译失败 → `#VALUE!`。而 Excel 用 PCRE2、
/// TS 引擎用 JS `RegExp`，两者都**支持**并算得出结果。
///
/// 没有单边把 TS 也改成拒绝：那会让两个引擎一起偏离 Excel，换来的只是“错得
/// 一致”。真正的收敛要换 Rust 侧的正则引擎（`fancy-regex` 支持这两类构造），
/// 属于依赖与产物体积的产品决策，不在本次改动范围内。这条测试的作用是让分歧
/// 有名有姓、改动时会被看见。
#[test]
fn backreference_and_lookaround_are_rejected_here_but_work_in_the_ts_engine() {
    assert_eq!(ev("=REGEXTEST(\"aa\", \"(a)\\1\")"), Value::Error(ValueError::InvalidValue));
    assert_eq!(ev("=REGEXTEST(\"ab\", \"a(?=b)\")"), Value::Error(ValueError::InvalidValue));
    assert_eq!(ev("=REGEXTEST(\"ab\", \"(?<=a)b\")"), Value::Error(ValueError::InvalidValue));
}

// --- REGEXREPLACE 的 `$` 展开 -----------------------------------------------

/// 替换串里的 `$` 展开必须和 TS 侧逐字节一致：`$n`、`$$`、`$&`、`` $` ``、`$'`
/// 认，`$0` 与越界的 `$12` 原样保留。TS 侧 occurrence=0 曾经走 JS 原生
/// `String.replace`，把 `$12`（只有 3 个组）当成 `$1` 再接字面 `2`，与这里
/// 分叉；本轮已让 TS 两条路径共用同一个展开器。
#[test]
fn dollar_expansion_matches_the_ts_engine() {
    assert_eq!(ev("=REGEXREPLACE(\"SoniaBrown\", \"([A-Z][a-z]+)([A-Z][a-z]+)\", \"$2, $1\")"), text("Brown, Sonia"));
    assert_eq!(ev("=REGEXREPLACE(\"abc\", \"(a)(b)(c)\", \"[$12]\")"), text("[$12]"));
    assert_eq!(ev("=REGEXREPLACE(\"abc\", \"b\", \"[$0]\")"), text("a[$0]c"));
    assert_eq!(ev("=REGEXREPLACE(\"abc\", \"b\", \"$$\")"), text("a$c"));
    assert_eq!(ev("=REGEXREPLACE(\"abc\", \"b\", \"<$&>\")"), text("a<b>c"));
    // `$<n>` 是 JS 原生独有的命名组语法，Excel 文档只给了 `$n`；两侧都当字面量。
    assert_eq!(ev("=REGEXREPLACE(\"abc\", \"(?<n>b)\", \"<$<n>>\")"), text("a<$<n>>c"));
}

/// 空匹配要按**码点**步进，不能按 UTF-16 码元 —— 否则星形平面字符（emoji）
/// 会被劈成两半，两个引擎的匹配次数就不同。`x*` 在 "😀" 上应当只有首尾两个
/// 空匹配。
#[test]
fn empty_matches_step_by_code_point() {
    assert_eq!(ev("=REGEXREPLACE(\"\u{1F600}\", \"x*\", \"-\")"), text("-\u{1F600}-"));
    assert_eq!(ev("=REGEXREPLACE(\"ab\", \"x*\", \"-\")"), text("-a-b-"));
}
