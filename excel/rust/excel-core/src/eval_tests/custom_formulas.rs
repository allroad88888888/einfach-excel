//! 宿主自定义公式的分发、参数求值与遮蔽优先级。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use crate::formula::parse_formula;

// === Host custom-formula registry: unit tests ===
//
// Exercises `EvalProvider::call_custom` via a stub provider that wraps
// an in-memory `HashMap<String, Box<dyn Fn(&[Value]) -> Value>>`. The
// wasm bridge wraps a `js_sys::Function` keyed registry on top of the
// same trait method; these tests cover the dispatch glue without
// dragging the wasm boundary in.

type CustomFn = Box<dyn Fn(&[Value]) -> Value>;

struct CustomFormulaProvider {
    names: HashMap<String, Value>,
    customs: HashMap<String, CustomFn>,
}

impl EvalProvider for CustomFormulaProvider {
    fn cell(&self, _addr: CellAddress) -> Value {
        Value::Null
    }
    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Error(ValueError::InvalidRef)
    }
    fn lookup_named(&self, name: &str) -> Option<Value> {
        self.names.get(&name.to_ascii_uppercase()).cloned()
    }
    fn call_custom(&self, name: &str, args: &[Value]) -> Option<Value> {
        let key = name.to_ascii_uppercase();
        self.customs.get(&key).map(|f| f(args))
    }
}

fn eval_with_customs(formula: &str, customs: Vec<(&str, CustomFn)>) -> Value {
    let expr = parse_formula(formula).expect("parse failed");
    let provider = CustomFormulaProvider {
        names: HashMap::new(),
        customs: customs
            .into_iter()
            .map(|(n, f)| (n.to_ascii_uppercase(), f))
            .collect(),
    };
    eval_expr_with_provider(&expr, &provider)
}

/// Custom function `MYFUNC(1, 2)` resolves through the registry and
/// returns the host-supplied result — `Value::Number(42.0)` here.
#[test]
fn custom_function_dispatch_returns_host_value() {
    let v = eval_with_customs(
        "=MYFUNC(1, 2)",
        vec![("MYFUNC", Box::new(|_args| Value::Number(42.0)))],
    );
    assert_eq!(v, Value::Number(42.0));
}

/// Args reach the custom callback already evaluated to scalars — the
/// stub sums them so we can prove the cell-reference / arithmetic
/// inside the call site happens BEFORE `call_custom` runs.
#[test]
fn custom_function_args_are_eagerly_evaluated() {
    let v = eval_with_customs(
        "=ADDER(10, 20+1)",
        vec![(
            "ADDER",
            Box::new(|args| {
                let mut sum = 0.0;
                for a in args {
                    if let Value::Number(n) = a {
                        sum += n;
                    }
                }
                Value::Number(sum)
            }),
        )],
    );
    assert_eq!(v, Value::Number(31.0));
}

/// Unknown function with empty custom registry still surfaces `#NAME?`
/// — `call_custom` default returns None, so the fallthrough path is
/// preserved.
#[test]
fn unknown_function_with_empty_custom_registry_returns_name_error() {
    let expr = parse_formula("=UNKNOWN_FN(1)").expect("parse failed");
    let provider = CustomFormulaProvider {
        names: HashMap::new(),
        customs: HashMap::new(),
    };
    let v = eval_expr_with_provider(&expr, &provider);
    assert_eq!(v, Value::Error(ValueError::InvalidName));
}

/// Custom-function lookup is case-insensitive — registration uses
/// upper-case (mirroring `WasmWorkbook::register_custom_formula`),
/// and `=myfunc()` still resolves.
#[test]
fn custom_function_lookup_is_case_insensitive() {
    let v = eval_with_customs(
        "=myfunc()",
        vec![("MYFUNC", Box::new(|_args| Value::Text("hi".into())))],
    );
    assert_eq!(v, Value::Text("hi".into()));
}

/// An error in any argument short-circuits — `call_custom` is NOT
/// invoked, mirroring `apply_lambda`'s error propagation. The custom
/// callback would have no way to handle a `#VALUE!` arg, so we
/// surface it before crossing the boundary.
#[test]
fn custom_function_propagates_arg_errors_without_invoking_callback() {
    use std::cell::Cell;
    use std::rc::Rc;
    let invoked = Rc::new(Cell::new(false));
    let invoked_clone = invoked.clone();
    let v = eval_with_customs(
        "=MYFUNC(1/0, 1)",
        vec![(
            "MYFUNC",
            Box::new(move |_args| {
                invoked_clone.set(true);
                Value::Number(0.0)
            }),
        )],
    );
    assert_eq!(v, Value::Error(ValueError::DivisionByZero));
    assert!(
        !invoked.get(),
        "custom callback must not run when an arg errors"
    );
}

/// Defined-name LAMBDA wins over a custom registration sharing the
/// same label. This pins the precedence rule documented on
/// `eval_named_call` — host customs cannot shadow LAMBDAs.
#[test]
fn lambda_defined_name_takes_precedence_over_custom() {
    let expr = parse_formula("=SHADOW(5)").expect("parse failed");
    let lambda = {
        let (cm, vs) = empty_env();
        eval_str("=LAMBDA(x, x*x)", &cm, &vs)
    };
    let mut names = HashMap::new();
    names.insert("SHADOW".to_string(), lambda);
    let mut customs: HashMap<String, CustomFn> = HashMap::new();
    customs.insert("SHADOW".to_string(), Box::new(|_| Value::Number(-1.0)));
    let provider = CustomFormulaProvider { names, customs };
    let v = eval_expr_with_provider(&expr, &provider);
    // Lambda wins → 5*5 = 25, not the custom registration's -1.
    assert_eq!(v, Value::Number(25.0));
}

/// Wave 8 codex-review fix #5: a scalar (non-LAMBDA) defined name
/// does NOT shadow a custom registration sharing the label. Before
/// the fix, `lookup_named` returning `Value::Number(42)` would
/// short-circuit to `#VALUE!`; after the fix, the call-shaped
/// `=MYFN(5)` falls through to the custom registry. Bare
/// `Expr::Name` (`=MYFN`) still surfaces the scalar via the
/// `Expr::Name` arm — that path is unchanged.
#[test]
fn scalar_defined_name_does_not_shadow_custom() {
    let expr = parse_formula("=MYFN(5)").expect("parse failed");
    let mut names = HashMap::new();
    // Pretend the workbook has `define_name("MYFN", "=42")`.
    names.insert("MYFN".to_string(), Value::Number(42.0));
    let mut customs: HashMap<String, CustomFn> = HashMap::new();
    customs.insert(
        "MYFN".to_string(),
        Box::new(|args| {
            if let Some(Value::Number(n)) = args.first() {
                Value::Number(n + 1.0)
            } else {
                Value::Error(ValueError::InvalidValue)
            }
        }),
    );
    let provider = CustomFormulaProvider { names, customs };
    let v = eval_expr_with_provider(&expr, &provider);
    // Custom wins → 5 + 1 = 6, not the scalar `MYFN` value of 42
    // (and not #VALUE!).
    assert_eq!(v, Value::Number(6.0));
}

/// Wave 8 codex-review fix #5 part 2: a defined name holding a
/// `Value::Array` (the rough analog of a "named range" — defined-name
/// arrays in this engine surface as `Value::Array` via the
/// `define_name` eval pass) likewise falls through to the custom
/// registry for a call-shaped reference. The bare `Expr::Name`
/// (`=MYFN`) still returns the array.
#[test]
fn array_defined_name_does_not_shadow_custom() {
    let call_expr = parse_formula("=MYFN()").expect("parse failed");
    let bare_expr = parse_formula("=MYFN").expect("parse failed");
    let mut names = HashMap::new();
    names.insert(
        "MYFN".to_string(),
        Value::Array(Arc::new(ArrayData::new(
            1,
            2,
            vec![Value::Number(10.0), Value::Number(20.0)],
        ))),
    );
    let mut customs: HashMap<String, CustomFn> = HashMap::new();
    customs.insert(
        "MYFN".to_string(),
        Box::new(|_| Value::Text("from custom".into())),
    );
    let provider = CustomFormulaProvider { names, customs };
    // `=MYFN()` is the call form → goes through the custom registry.
    let call_v = eval_expr_with_provider(&call_expr, &provider);
    assert_eq!(call_v, Value::Text("from custom".into()));
    // `=MYFN` is the bare-name form → returns the defined-name
    // array value verbatim.
    let bare_v = eval_expr_with_provider(&bare_expr, &provider);
    match bare_v {
        Value::Array(arr) => {
            assert_eq!(arr.rows, 1);
            assert_eq!(arr.cols, 2);
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

/// Wave 8 codex-review fix #6: a literal range argument
/// (`=SUMSQ(A1:A3)`) reaches the custom callback as a 2-D
/// `Value::Array` rather than `#VALUE!`. The callback sums the
/// squares of every element to prove the marshaled array round-
/// trips correctly. Uses the AtomEvalProvider-shaped shim from the
/// surrounding test module — `A1=1, A2=2, A3=3` via the cm/vs
/// fixture.
#[test]
fn custom_function_receives_range_arg_as_2d_array() {
    // Wire up a per-cell scalar fixture so `A1:A3` evaluates to the
    // three rows 1, 2, 3.
    let mut customs: HashMap<String, CustomFn> = HashMap::new();
    customs.insert(
        "SUMSQ".to_string(),
        Box::new(|args| {
            let Some(Value::Array(arr)) = args.first() else {
                return Value::Error(ValueError::InvalidValue);
            };
            let mut total = 0.0;
            for v in &arr.data {
                if let Value::Number(n) = v {
                    total += n * n;
                }
            }
            Value::Number(total)
        }),
    );

    // Custom EvalProvider that returns the 1/2/3 scalars for A1/A2/A3
    // (mirrors the shape `AtomEvalProvider` would build for the test
    // env, but stays self-contained inside this module).
    struct RangeFixtureProvider {
        customs: HashMap<String, CustomFn>,
    }
    impl EvalProvider for RangeFixtureProvider {
        fn cell(&self, addr: CellAddress) -> Value {
            // A1 → row 0 col 0 → 1.0, etc.
            if addr.col == 0 && addr.row <= 2 {
                Value::Number((addr.row + 1) as f64)
            } else {
                Value::Null
            }
        }
        fn sheet_cell(&self, _: &str, _: CellAddress) -> Value {
            Value::Error(ValueError::InvalidRef)
        }
        fn call_custom(&self, name: &str, args: &[Value]) -> Option<Value> {
            self.customs
                .get(&name.to_ascii_uppercase())
                .map(|f| f(args))
        }
    }

    let provider = RangeFixtureProvider { customs };
    let expr = parse_formula("=SUMSQ(A1:A3)").expect("parse failed");
    let v = eval_expr_with_provider(&expr, &provider);
    // 1 + 4 + 9 = 14
    assert_eq!(v, Value::Number(14.0));
}
