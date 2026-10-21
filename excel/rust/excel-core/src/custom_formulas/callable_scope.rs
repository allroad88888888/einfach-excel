//! A removed custom dependency must never fall through into a host callback or
//! unrelated global named LAMBDA that later acquires the same name.
use crate::Expr;
use einfach_core::ValueError;
use std::collections::BTreeSet;
use std::sync::OnceLock;

fn builtins() -> &'static BTreeSet<&'static str> {
    static NAMES: OnceLock<BTreeSet<&'static str>> = OnceLock::new();
    NAMES.get_or_init(|| {
        crate::builtin_function_catalog()
            .iter()
            .map(|entry| entry.name)
            .collect()
    })
}

pub(super) fn restrict(
    expr: &mut Expr,
    scope: &BTreeSet<String>,
    is_custom: &impl Fn(&str) -> bool,
) {
    match expr {
        Expr::FuncCall { name, args } => {
            if !builtins().contains(name.as_str()) && !scope.contains(name) && !is_custom(name) {
                *expr = Expr::Error(ValueError::InvalidName);
                return;
            }
            if name == "LET" || name == "LAMBDA" {
                let lambda = name == "LAMBDA";
                let mut local = scope.clone();
                let last = args.len().saturating_sub(1);
                let step = if lambda { 1 } else { 2 };
                for index in (0..last).step_by(step) {
                    if !lambda {
                        restrict(&mut args[index + 1], &local, is_custom);
                    }
                    if let Expr::Name(binding) = &args[index] {
                        local.insert(binding.to_uppercase());
                    }
                }
                if let Some(body) = args.last_mut() {
                    restrict(body, &local, is_custom);
                }
            } else {
                for arg in args {
                    restrict(arg, scope, is_custom);
                }
            }
        }
        Expr::Call(callee, args) => {
            restrict(callee, scope, is_custom);
            for arg in args {
                restrict(arg, scope, is_custom);
            }
        }
        Expr::BinOp { left, right, .. } => {
            restrict(left, scope, is_custom);
            restrict(right, scope, is_custom);
        }
        Expr::Negate(value) | Expr::Percent(value) => restrict(value, scope, is_custom),
        Expr::ArrayLit { data, .. } => {
            for value in data {
                restrict(value, scope, is_custom);
            }
        }
        _ => {}
    }
}
