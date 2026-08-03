//! Unit tests for the ASCII-dialect pattern rewrite (`eval_regex_ascii.rs`).
//!
//! 与 `eval_regex_tests.rs` 分开：那边测的是三个内建的 Excel 语义与编译缓存，
//! 这边测的是「送进 `regex::Regex::new` 之前模式被改成了什么」，两件事，且这边
//! 一条 `ev` 都不需要 —— 断言直接打在改写函数的输出字符串上。

use super::ascii::to_ascii_classes;


/// 类外用作用域组，类内用嵌套类 —— 两种位置不能互换：`[(?-u:\d)]` 会被
/// 当成一堆字面字符，而 `[0-9]` 出现在类外就是一个独立的类。
#[test]
fn ascii_rewrite_is_position_aware() {
    assert_eq!(to_ascii_classes("\\d+"), "(?-u:\\d)+");
    assert_eq!(to_ascii_classes("[\\d-]"), "[[0-9]-]");
    assert_eq!(to_ascii_classes("[\\w]"), "[[0-9A-Za-z_]]");
    assert_eq!(to_ascii_classes("\\b\\w\\B"), "(?-u:\\b)(?-u:\\w)(?-u:\\B)");
}

/// 否定形态不能用 `(?-u:)`（会匹配非法 UTF-8，`regex` 拒编），只能写成保留
/// Unicode 模式的否定类；类内则借嵌套类。
#[test]
fn ascii_rewrite_negated_forms_stay_in_unicode_mode() {
    assert_eq!(to_ascii_classes("\\D"), "[^0-9]");
    assert_eq!(to_ascii_classes("\\W"), "(?-i:[^0-9A-Za-z_])");
    assert_eq!(to_ascii_classes("[\\Dx]"), "[[^0-9]x]");
    assert_eq!(to_ascii_classes("[\\Wx]"), "[[^0-9A-Za-z_]x]");
}

/// `\s` / `\S` 的展开：六个 ASCII 空白码点，肯定与否定共用同一份集合体。
#[test]
fn ascii_rewrite_expands_whitespace_classes() {
    assert_eq!(to_ascii_classes("\\s"), "[\\t\\n\\x0B\\x0C\\r\\x20]");
    assert_eq!(to_ascii_classes("\\S"), "[^\\t\\n\\x0B\\x0C\\r\\x20]");
    assert_eq!(to_ascii_classes("[\\sx]"), "[[\\t\\n\\x0B\\x0C\\r\\x20]x]");
    assert_eq!(to_ascii_classes("[\\Sx]"), "[[^\\t\\n\\x0B\\x0C\\r\\x20]x]");
}

/// 类内**不能摊平成裸区间**：展开的尾字符会和后面的 `-` 拼出假区间。
/// `[\w-x]` 一旦摊成 `[0-9A-Za-z_-x]`，其中 `_-x` 是 U+005F..U+0078，反引号被
/// 误收、字面 `-` 反而丢了。嵌套类不能充当区间端点，`-` 只能是字面量。
#[test]
fn ascii_rewrite_inside_a_class_cannot_form_a_bogus_range() {
    assert_eq!(to_ascii_classes("[\\w-x]"), "[[0-9A-Za-z_]-x]");
    let re = regex::Regex::new(&to_ascii_classes("^[\\w-x]$")).unwrap();
    assert!(re.is_match("-"), "字面 `-` 必须留在集合里");
    assert!(!re.is_match("`"), "反引号不该被假区间捎进来");
    let re = regex::Regex::new(&to_ascii_classes("^[\\s-x]$")).unwrap();
    assert!(re.is_match(" ") && re.is_match("-") && re.is_match("x"));
    assert!(!re.is_match("a") && !re.is_match("5"));
}

/// 字符类的**嵌套**要按深度数，不能用布尔量。`regex` 认 `[[0-9]a]` 这种嵌套
/// 类，布尔量会在内层 `]` 上误判“出类了”，随后的 `\d` 就走成类外分支，生成
/// `[[0-9](?-u:\d)]` —— 语义完全不同（原模式对 "a" 是 false，那个是 true）。
/// POSIX 记号 `[:alpha:]` 里的 `[` 则**不**开新层，否则深度会偏移一位。
#[test]
fn ascii_rewrite_tracks_nested_and_posix_classes() {
    assert_eq!(to_ascii_classes("[[0-9]\\d]"), "[[0-9][0-9]]");
    assert_eq!(to_ascii_classes("[[:alpha:]\\d]"), "[[:alpha:][0-9]]");
    assert_eq!(to_ascii_classes("[[:^alpha:]\\s]"), "[[:^alpha:][\\t\\n\\x0B\\x0C\\r\\x20]]");
    // 出了外层类之后必须重新按类外分支改写。
    assert_eq!(to_ascii_classes("[[0-9]a]\\d"), "[[0-9]a](?-u:\\d)");
    let re = regex::Regex::new(&to_ascii_classes("^[[0-9]\\d]$")).unwrap();
    assert!(re.is_match("5") && !re.is_match("a"));
}

/// 无关的转义原样透传，尤其是 `\\`（转义反斜杠）后面跟的 `d`/`s` 是**字面**
/// 字符，不是字符类。
#[test]
fn ascii_rewrite_leaves_other_escapes_alone() {
    assert_eq!(to_ascii_classes("\\\\d"), "\\\\d");
    assert_eq!(to_ascii_classes("\\\\s"), "\\\\s");
    assert_eq!(to_ascii_classes("a\\.b"), "a\\.b");
    assert_eq!(to_ascii_classes("[a\\]\\d]"), "[a\\][0-9]]");
    // 没有反斜杠 → 原样借用，不分配。
    assert!(matches!(to_ascii_classes("[0-9]+"), std::borrow::Cow::Borrowed(_)));
}
