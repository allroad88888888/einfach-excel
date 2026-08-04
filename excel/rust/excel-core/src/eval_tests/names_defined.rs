//! 定义名注册表的解析、遮蔽与递归 LAMBDA。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use crate::formula::parse_formula;

// === Defined-name registry: unit tests ===
//
// The integration tests in `excel/rust/excel-core/tests/named_lambda.rs`
// exercise the full Workbook path. These unit tests drive
// `EvalProvider::lookup_named` directly via a stub provider so the
// dispatch table changes in this commit (Expr::Name fallthrough +
// Expr::FuncCall fallthrough + recursion guard) are covered without
// dragging in cross-sheet / spill plumbing.

/// Minimal `EvalProvider` that wraps `AtomEvalProvider` with an
/// in-memory named-value registry. Mirrors what `WorkbookEvalProvider`
/// does at the workbook layer: cell reads go to the cell map, name
/// lookups go to the registry. Built per test so each case starts
/// from a clean slate.
struct NamedEvalProvider<'a> {
    get: &'a dyn Fn(AtomId) -> Value,
    cell_map: &'a HashMap<CellAddress, AtomId>,
    names: HashMap<String, Value>,
}

impl<'a> EvalProvider for NamedEvalProvider<'a> {
    fn cell(&self, addr: CellAddress) -> Value {
        self.cell_map
            .get(&addr)
            .map(|&id| (self.get)(id))
            .unwrap_or(Value::Null)
    }
    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Error(ValueError::InvalidRef)
    }
    fn lookup_named(&self, name: &str) -> Option<Value> {
        // Case-insensitive lookup — match the workbook contract so
        // tests can register `square` and reference `=SQUARE(5)`.
        let key = name.to_ascii_uppercase();
        self.names.get(&key).cloned()
    }
}

fn eval_with_names(
    formula: &str,
    names: &[(&str, Value)],
    cell_map: &HashMap<CellAddress, AtomId>,
    values: &HashMap<AtomId, Value>,
) -> Value {
    let expr = parse_formula(formula).expect("parse failed");
    let get = |id: AtomId| -> Value { values.get(&id).cloned().unwrap_or(Value::Null) };
    let registry: HashMap<String, Value> = names
        .iter()
        .map(|(n, v)| (n.to_ascii_uppercase(), v.clone()))
        .collect();
    let provider = NamedEvalProvider {
        get: &get,
        cell_map,
        names: registry,
    };
    eval_expr_with_provider(&expr, &provider)
}

/// Build a `Value::Lambda` by parsing & evaluating a `=LAMBDA(...)`
/// formula. Used by the recursive-LAMBDA tests so the captured
/// snapshot is built through the same path that production uses.
fn make_lambda(formula: &str) -> Value {
    let (cm, vs) = empty_env();
    let v = eval_str(formula, &cm, &vs);
    assert!(matches!(v, Value::Lambda(_)), "expected Lambda, got {v:?}");
    v
}

/// Defined name resolves as a scalar in `Expr::Name` position.
#[test]
fn defined_name_scalar_resolves() {
    let (cm, vs) = empty_env();
    let v = eval_with_names("=answer", &[("answer", Value::Number(42.0))], &cm, &vs);
    assert_eq!(v, Value::Number(42.0));
}

/// Defined name participates in arithmetic.
#[test]
fn defined_name_scalar_in_expression() {
    let (cm, vs) = empty_env();
    let v = eval_with_names("=answer+1", &[("answer", Value::Number(42.0))], &cm, &vs);
    assert_eq!(v, Value::Number(43.0));
}

/// Named LAMBDA invoked via function-call syntax.
#[test]
fn defined_name_lambda_callable_as_function() {
    let (cm, vs) = empty_env();
    let square = make_lambda("=LAMBDA(x, x*x)");
    let v = eval_with_names("=square(7)", &[("square", square)], &cm, &vs);
    assert_eq!(v, Value::Number(49.0));
}

/// Lookup is case-insensitive: definition uses lowercase, reference
/// uses uppercase.
#[test]
fn defined_name_lookup_case_insensitive() {
    let (cm, vs) = empty_env();
    let square = make_lambda("=LAMBDA(x, x*x)");
    let v = eval_with_names("=SQUARE(3)", &[("square", square)], &cm, &vs);
    assert_eq!(v, Value::Number(9.0));
}

/// Unbound name surfaces #NAME?.
#[test]
fn undefined_name_surfaces_name_error() {
    let (cm, vs) = empty_env();
    let v = eval_with_names("=missing", &[], &cm, &vs);
    assert_eq!(v, Value::Error(ValueError::InvalidName));
}

/// Unknown function surfaces #NAME? (registry empty, no built-in
/// match).
#[test]
fn unknown_function_call_surfaces_name_error() {
    let (cm, vs) = empty_env();
    let v = eval_with_names("=missing(1, 2)", &[], &cm, &vs);
    assert_eq!(v, Value::Error(ValueError::InvalidName));
}

/// Non-callable defined name invoked as a function falls through to
/// the custom-formula registry (Wave 8 codex-review fix #5). With
/// no custom registered, the fallthrough surfaces #NAME?. Pre-fix
/// behavior was #VALUE!: any defined name consumed the call site
/// and triggered a "not callable" error. The new behavior keeps
/// non-LAMBDA defined names reachable via bare `Expr::Name` (`=answer`
/// still returns 42) without blocking the registry fallthrough.
#[test]
fn non_lambda_name_called_as_function_falls_through_to_custom_then_name_error() {
    let (cm, vs) = empty_env();
    let v = eval_with_names("=answer(1)", &[("answer", Value::Number(42.0))], &cm, &vs);
    assert_eq!(v, Value::Error(ValueError::InvalidName));
}

/// LET binding shadows a defined name (LET wins over registry).
#[test]
fn let_binding_shadows_defined_name() {
    let (cm, vs) = empty_env();
    let v = eval_with_names(
        "=LET(answer, 1, answer*2)",
        &[("answer", Value::Number(42.0))],
        &cm,
        &vs,
    );
    assert_eq!(v, Value::Number(2.0));
}

/// Recursive named LAMBDA — `fact(5) = 120`. Verifies the body's
/// internal `fact(n-1)` reference resolves through the registry
/// (not via LET-frame, which doesn't see the lambda's own name at
/// definition time).
#[test]
fn recursive_named_lambda_factorial() {
    let (cm, vs) = empty_env();
    let fact = make_lambda("=LAMBDA(n, IF(n<=1, 1, n*fact(n-1)))");
    let v = eval_with_names("=fact(5)", &[("fact", fact)], &cm, &vs);
    assert_eq!(v, Value::Number(120.0));
}

/// Recursive named LAMBDA — fibonacci. Two recursive calls per
/// frame; verifies the recursion guard's depth tracking pops
/// correctly between sibling calls (otherwise depth would
/// monotonically grow and bust the cap for moderate n).
#[test]
fn recursive_named_lambda_fibonacci() {
    let (cm, vs) = empty_env();
    let fib = make_lambda("=LAMBDA(n, IF(n<=1, n, fib(n-1)+fib(n-2)))");
    let v = eval_with_names("=fib(7)", &[("fib", fib)], &cm, &vs);
    assert_eq!(v, Value::Number(13.0));
}

/// Pathological recursion hits the depth cap and returns #NUM!
/// instead of overflowing the stack. Uses a definition that just
/// recurses without converging — the cap should trigger long
/// before any stack damage.
#[test]
fn pathological_recursion_returns_num_error() {
    let (cm, vs) = empty_env();
    let bad = make_lambda("=LAMBDA(n, bad(n))");
    let v = eval_with_names("=bad(1)", &[("bad", bad)], &cm, &vs);
    assert_eq!(v, Value::Error(ValueError::Overflow));
}
