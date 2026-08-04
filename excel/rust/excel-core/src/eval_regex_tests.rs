//! Unit tests for the REGEX* built-ins and their compiled-regex cache.
//!
//! In their own file so neither implementation file has to carry a test
//! module, and so both halves share one `ev` helper.

use std::collections::HashMap;

use einfach_core::{AtomId, Value, ValueError};

use super::cache::{regex_cache_len, regex_cache_reset, regex_compile_count, REGEX_CACHE_CAP};
use crate::eval::eval_expr;
use crate::formula::parse_formula;

/// Parse and evaluate `formula` against an empty sheet. Mirrors
/// `eval::tests::ev`; duplicated rather than imported because that helper is
/// private to `eval`'s own test module, which is a sibling of this one.
fn ev(formula: &str) -> Value {
    let expr = parse_formula(formula).expect("parse failed");
    let cell_map = HashMap::new();
    let get = |_id: AtomId| -> Value { Value::Null };
    eval_expr(&expr, &get, &cell_map)
}

// --- REGEX* built-ins ---
#[test]
fn eval_regextest_happy() {
    assert_eq!(ev("=REGEXTEST(\"hello\", \"ell\")"), Value::Boolean(true));
    assert_eq!(ev("=REGEXTEST(\"hello\", \"xyz\")"), Value::Boolean(false));
}
#[test]
fn eval_regextest_case_insensitive() {
    assert_eq!(
        ev("=REGEXTEST(\"Hello\", \"hello\")"),
        Value::Boolean(false)
    );
    assert_eq!(
        ev("=REGEXTEST(\"Hello\", \"hello\", 1)"),
        Value::Boolean(true)
    );
}
#[test]
fn eval_regextest_invalid_pattern() {
    assert_eq!(
        ev("=REGEXTEST(\"hello\", \"[\")"),
        Value::Error(ValueError::InvalidValue)
    );
}
#[test]
fn eval_regextest_arg_count() {
    assert_eq!(
        ev("=REGEXTEST(\"a\")"),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        ev("=REGEXTEST(\"a\", \"b\", 1, 2)"),
        Value::Error(ValueError::WrongArgCount)
    );
}
#[test]
fn eval_regexextract_first_match() {
    assert_eq!(
        ev("=REGEXEXTRACT(\"abc123def\", \"[0-9]+\")"),
        Value::Text("123".into())
    );
}
#[test]
fn eval_regexextract_all_matches_as_array() {
    let v = ev("=REGEXEXTRACT(\"a1 b2 c3\", \"[a-z][0-9]\", 1)");
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (3, 1));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a1".into())));
            assert_eq!(arr.get(1, 0), Some(&Value::Text("b2".into())));
            assert_eq!(arr.get(2, 0), Some(&Value::Text("c3".into())));
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}
#[test]
fn eval_regexextract_no_match_is_error() {
    // `#N/A`（不是 `#VALUE!`）—— `#VALUE!` 专属于“模式非法”。
    assert_eq!(
        ev("=REGEXEXTRACT(\"abc\", \"[0-9]+\")"),
        Value::Error(ValueError::NotAvailable)
    );
}
#[test]
fn eval_regexextract_arg_count() {
    assert_eq!(
        ev("=REGEXEXTRACT(\"a\")"),
        Value::Error(ValueError::WrongArgCount)
    );
}
#[test]
fn eval_regexreplace_replace_all() {
    assert_eq!(
        ev("=REGEXREPLACE(\"a1 b2 c3\", \"[0-9]\", \"X\")"),
        Value::Text("aX bX cX".into())
    );
}
#[test]
fn eval_regexreplace_nth_occurrence() {
    assert_eq!(
        ev("=REGEXREPLACE(\"a1 b2 c3\", \"[0-9]\", \"X\", 2)"),
        Value::Text("a1 bX c3".into())
    );
}
#[test]
fn eval_regexreplace_case_insensitive() {
    assert_eq!(
        ev("=REGEXREPLACE(\"HELLO hello\", \"hello\", \"X\", 0, 1)"),
        Value::Text("X X".into())
    );
}
#[test]
fn eval_regexreplace_arg_count() {
    assert_eq!(
        ev("=REGEXREPLACE(\"a\")"),
        Value::Error(ValueError::WrongArgCount)
    );
}
#[test]
fn eval_regexreplace_invalid_pattern() {
    assert_eq!(
        ev("=REGEXREPLACE(\"a\", \"[\", \"x\")"),
        Value::Error(ValueError::InvalidValue)
    );
}

// --- Compiled-regex cache (REGEX_CACHE_CAP) ---

/// A pattern evaluated many times compiles exactly ONCE. This is the
/// whole point of the cache: a filled-down column of 100k REGEXTEST
/// cells is 100k evaluations of the same pattern, and before the cache
/// each of them paid a full `Regex::new`. The compile counter is the
/// direct observation — not a proxy — that `Regex::new` stops being
/// reached after the first call.
#[test]
fn regex_cache_compiles_a_repeated_pattern_once() {
    regex_cache_reset();
    for _ in 0..50 {
        assert_eq!(
            ev("=REGEXTEST(\"cache-hit-probe\", \"cache-[a-z]+-probe\")"),
            Value::Boolean(true)
        );
    }
    assert_eq!(regex_compile_count(), 1, "pattern should compile once");
    assert_eq!(regex_cache_len(), 1);
}

/// The case flag is part of the key: the same pattern text compiled
/// case-sensitively and case-insensitively are different programs
/// (`(?i)` prefix), so they must not alias. Two compiles, two entries,
/// and the case-insensitive one still matches differently.
#[test]
fn regex_cache_keys_on_the_case_flag() {
    regex_cache_reset();
    assert_eq!(
        ev("=REGEXTEST(\"CaseKeyProbe\", \"casekeyprobe\")"),
        Value::Boolean(false)
    );
    assert_eq!(
        ev("=REGEXTEST(\"CaseKeyProbe\", \"casekeyprobe\", 1)"),
        Value::Boolean(true)
    );
    assert_eq!(regex_compile_count(), 2);
    assert_eq!(regex_cache_len(), 2);
    // Re-running both hits the cache instead of recompiling.
    assert_eq!(
        ev("=REGEXTEST(\"CaseKeyProbe\", \"casekeyprobe\")"),
        Value::Boolean(false)
    );
    assert_eq!(
        ev("=REGEXTEST(\"CaseKeyProbe\", \"casekeyprobe\", 1)"),
        Value::Boolean(true)
    );
    assert_eq!(regex_compile_count(), 2);
}

/// Failures are deliberately NOT memoised: an invalid pattern must
/// re-derive its error from the compiler every time, so no cache entry
/// can ever pin a pattern as permanently-failing, and garbage patterns
/// cannot evict hot entries. Observable result is unchanged — still
/// `#VALUE!` on every evaluation.
#[test]
fn regex_cache_does_not_memoise_failures() {
    regex_cache_reset();
    for _ in 0..3 {
        assert_eq!(
            ev("=REGEXTEST(\"x\", \"[unclosed-class-probe\")"),
            Value::Error(ValueError::InvalidValue)
        );
    }
    assert_eq!(regex_compile_count(), 3, "each failure recompiles");
    assert_eq!(regex_cache_len(), 0, "no entry stored for a bad pattern");
}

/// The cache is bounded. Feeding it more distinct patterns than the cap
/// must not grow it without limit; the clear-all eviction drops the
/// whole table and starts refilling.
#[test]
fn regex_cache_is_bounded_by_its_cap() {
    regex_cache_reset();
    for i in 0..(REGEX_CACHE_CAP * 2 + 1) {
        // Distinct pattern per iteration — the pathological "pattern
        // synthesised per row" workload the clear-all policy targets.
        let f = format!("=REGEXTEST(\"bounded{}\", \"bounded{}\")", i, i);
        assert_eq!(ev(&f), Value::Boolean(true));
        assert!(
            regex_cache_len() <= REGEX_CACHE_CAP,
            "cache exceeded its declared cap at i={}",
            i
        );
    }
    // Every pattern was distinct, so every one of them compiled.
    assert_eq!(regex_compile_count(), REGEX_CACHE_CAP * 2 + 1);
}

/// 缓存键必须是**原始**模式，不是改写后的。改写发生在未命中之后，若不小心
/// 把改写结果写回键位，同一条模式第二次查就会未命中并重新编译 —— 缓存直接
/// 失效而没有任何其他可见症状。编译计数是唯一能抓到它的探针。
#[test]
fn regex_cache_keys_on_the_raw_pattern_not_the_rewritten_one() {
    regex_cache_reset();
    for _ in 0..5 {
        assert_eq!(ev("=REGEXTEST(\"key7probe\", \"key\\dprobe\")"), Value::Boolean(true));
    }
    assert_eq!(regex_compile_count(), 1, "改写后的模式不该顶掉原始键");
}
