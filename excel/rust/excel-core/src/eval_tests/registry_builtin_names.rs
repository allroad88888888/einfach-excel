//! 内建函数名注册表与分发表的一致性。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
// 只有 `#[cfg]` 门控的用例用到 —— 另一种构建下会是 unused。
#[allow(unused_imports)]
use super::common::*;

/// `is_builtin_function_name` is exported for the workbook's reserved-name
/// check. Sanity-check a handful of arms so a typo in the giant
/// `matches!` block surfaces here rather than silently falling
/// through to the registry.
#[test]
fn builtin_function_name_check_covers_known_arms() {
    // Sample of one-letter, dotted, and multi-character names.
    assert!(is_builtin_function_name("SUM"));
    assert!(is_builtin_function_name("IF"));
    assert!(is_builtin_function_name("LAMBDA"));
    assert!(is_builtin_function_name("LET"));
    assert!(is_builtin_function_name("VLOOKUP"));
    assert!(is_builtin_function_name("T.DIST"));
    assert!(is_builtin_function_name("N"));
    assert!(is_builtin_function_name("T"));
    // Negative cases: names a user might pick, none of which are
    // built-ins.
    assert!(!is_builtin_function_name("SQUARE"));
    assert!(!is_builtin_function_name("MY_FUNC"));
    assert!(!is_builtin_function_name("answer"));
}

/// is_builtin_function_name covers the seven new arms.
#[test]
fn builtin_function_name_covers_new_arms() {
    assert!(is_builtin_function_name("TEXTSPLIT"));
    assert!(is_builtin_function_name("TEXTBEFORE"));
    assert!(is_builtin_function_name("TEXTAFTER"));
    assert!(is_builtin_function_name("LOOKUP"));
    assert!(is_builtin_function_name("FORMULATEXT"));
    assert!(is_builtin_function_name("AREAS"));
    assert!(is_builtin_function_name("ENCODEURL"));
}

#[test]
fn legacy_aliases_registered_as_builtins() {
    // Smoke test the alphabetised reserved-name list.
    for name in [
        "BETADIST",
        "BETAINV",
        "BINOMDIST",
        "CHIDIST",
        "CHIINV",
        "CHITEST",
        "CHISQ.TEST",
        "CONFIDENCE",
        "CONFIDENCE.NORM",
        "COVAR",
        "COVAR.P",
        "COVARIANCE.P",
        "COVARIANCE.S",
        "CRITBINOM",
        "EXPONDIST",
        "FDIST",
        "FINV",
        "F.TEST",
        "FTEST",
        "GAMMADIST",
        "GAMMAINV",
        "HYPGEOMDIST",
        "LOGINV",
        "LOGNORM.DIST",
        "LOGNORM.INV",
        "LOGNORMDIST",
        "NEGBINOMDIST",
        "NORMDIST",
        "NORMINV",
        "NORMSDIST",
        "NORMSINV",
        "POISSON",
        "TDIST",
        "TINV",
        "T.TEST",
        "TTEST",
        "WEIBULL",
        "Z.TEST",
        "ZTEST",
    ] {
        assert!(
            is_builtin_function_name(name),
            "{} should be a builtin",
            name
        );
    }
}

// --- T-batch: confirm all new names register as builtins ---

#[test]
fn t_batch_names_registered_as_builtins() {
    for name in [
        "ACOTH",
        "TRUE",
        "FALSE",
        "NA",
        "ISREF",
        "STDEVP",
        "VARP",
        "CONFIDENCE.T",
        "BINOM.DIST.RANGE",
        "PERMUT",
        "PERMUTATIONA",
        "DAYS360",
        "ERF.PRECISE",
        "ERFC.PRECISE",
        "GAMMALN.PRECISE",
        "CONCAT",
        "TRANSLATE",
    ] {
        assert!(
            is_builtin_function_name(name),
            "{} should be a builtin",
            name
        );
    }
}

/// With `regex-formulas` off the three names are not built-ins at all.
/// They take `eval_func`'s `_` arm into `eval_named_call`, find neither
/// a defined LAMBDA nor a host custom formula, and land on `#NAME?` —
/// exactly what `=NOSUCHFUNC(1)` returns. This test pins that
/// degradation so the lite wasm build's contract is asserted, not
/// assumed.
#[cfg(not(feature = "regex-formulas"))]
#[test]
fn regex_builtins_degrade_to_name_error_without_the_feature() {
    for f in [
        "=REGEXTEST(\"hello\", \"ell\")",
        "=REGEXEXTRACT(\"abc123\", \"[0-9]+\")",
        "=REGEXREPLACE(\"a1\", \"[0-9]\", \"X\")",
    ] {
        assert_eq!(ev(f), Value::Error(ValueError::InvalidName), "{}", f);
    }
    // Same answer a genuinely unknown function gets.
    assert_eq!(ev("=NOSUCHFUNC(1)"), Value::Error(ValueError::InvalidName));
}
