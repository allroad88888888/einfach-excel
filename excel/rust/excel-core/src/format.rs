pub use crate::number_format::NumberFormat;
use crate::number_format::default_number_string;
use einfach_core::{Value, ValueError};
use std::borrow::Cow;

pub use crate::cell_format::{Align, BorderSpec, BorderStyle, CellBorders, CellFormat, FontBaseline, Rotation, VerticalAlign};

/// Collapse a spill anchor's `Value::Array` to its top-left scalar. Twin of
/// `sheet::collapse_array_for_eval` on the display side: the boundary never
/// shows the `Array` variant, it shows what Excel shows when you look at an
/// array-formula anchor.
fn collapse_array_for_display(val: &Value) -> std::borrow::Cow<'_, Value> {
    match val {
        Value::Array(arr) => std::borrow::Cow::Owned(arr.get(0, 0).cloned().unwrap_or(Value::Null)),
        _ => std::borrow::Cow::Borrowed(val),
    }
}

/// The USER-VISIBLE token for an evaluation error.
///
/// `ValueError`'s `Display` impl (`einfach_core::atom`) is the ENGINE-INTERNAL
/// spelling: it names the diagnostic variant, and three of those variants have
/// no Excel counterpart at all. Everything else renders as it serializes.
///
/// # Registry of non-Excel codes
///
/// This function is the single place the engine decides what a user reads, so
/// the register of "codes Excel does not have" lives here rather than in a doc
/// someone would have to already know to look for. The TypeScript twin
/// (`excel/solid-excel/src/adapter/error-display-token.ts`) mirrors this
/// table, and the always-on `cross-engine-parity-smoke.test.ts` pins both
/// engines to it — a one-sided change here goes red there.
///
/// | internal (`Display`) | shown to the user | disposition |
/// |---|---|---|
/// | `#TYPE!` (`WrongType`)      | `#VALUE!` | collapsed |
/// | `#ARGS!` (`WrongArgCount`)  | `#VALUE!` | collapsed |
/// | `#CYCLE!` (`CyclicRef`)     | `#CYCLE!` | **deliberate extension — kept** |
///
/// **`WrongType` → `#VALUE!`.** Excel has no `#TYPE!` code, so a cell showing
/// `#TYPE!` is something no real spreadsheet can produce, and the engine
/// already answers `#VALUE!` from the arithmetic operators
/// (`eval::eval_binop`, `=1+"x"`). The ~350 built-in argument-type checks keep
/// `WrongType` because the DIAGNOSTIC distinction earns its keep: a failing
/// assertion that says `WrongType` tells you an argument-type guard fired,
/// `InvalidValue` does not.
///
/// **`WrongArgCount` → `#VALUE!`.** Excel rejects a wrong argument count at
/// ENTRY TIME — the formula bar refuses the edit with a dialog — so the
/// mistake never reaches a cell and Excel has no code for it. This engine has
/// no entry-time validation layer, so the same mistake has to survive as a
/// cell value; `#VALUE!` is the closest thing a spreadsheet user can read.
/// The variant itself stays for the same reason `WrongType` does: "arity
/// guard fired" is a distinct diagnosis, and `ERROR.TYPE` already grades it 3
/// (`#VALUE!`'s number), so the collapse costs no host-visible information.
///
/// **`CyclicRef` stays `#CYCLE!` — this repo deliberately does NOT align.**
/// Excel's behaviour for a circular reference is to display `0` and warn in
/// the status bar. Degrading to `0` would hide a real bug inside a plausible
/// number: a mis-typed `=SUM(A1:A5)` in `A5` would read as a legitimate total.
/// A distinct code that a user can search for is strictly more useful than
/// Excel's answer, and it is the ONE place we take that trade. Treat this row
/// as a decision, not an oversight — a future "align everything with Excel"
/// pass should leave it alone.
///
/// # Why `Display` is not touched
///
/// `Display` deliberately stays as-is, because it is also the FORMULA-TEXT
/// serializer (`shift::render_formula` renders `Expr::Error` via `to_string`)
/// and that text has to re-parse through `formula::parse_error_literal`, whose
/// table still maps `#TYPE!` and `#ARGS!` back to their variants. Rendering
/// and serialization are different boundaries with different vocabularies;
/// only the rendering one is Excel-facing. A serialization format may be WIDER
/// than the display vocabulary, never narrower.
pub fn error_display_token(err: &ValueError) -> Cow<'static, str> {
    match err {
        ValueError::WrongType | ValueError::WrongArgCount => Cow::Borrowed("#VALUE!"),
        other => Cow::Owned(other.to_string()),
    }
}

/// The UNFORMATTED display string of a value — no `NumberFormat` applied.
///
/// THE single definition of "what this cell looks like as text" at the
/// engine boundary. `excel/rust/wasm`'s private `value_to_display` delegates to
/// it, which is what makes it the exact string the `readSparseRange` /
/// `getCellDisplay` wire carries, and therefore the exact string the host's
/// TypeScript filter predicate (`excel/solid-excel/src/adapter/
/// filter-predicate.ts`) compares against today.
///
/// That identity is the whole reason the E3 filter sink-down is
/// behaviour-preserving on the worker path: `Workbook::apply_filter` feeds
/// its predicate from here, so the Rust predicate reads byte-identical
/// input to what the TypeScript predicate reads over the wire. A second,
/// separately-maintained formatter in the engine would have re-opened
/// exactly the drift the port exists to close.
///
/// Number formats are deliberately NOT applied: neither side applies them
/// on this path either (`applyNumberFormatsToCells` runs on the projection
/// read, not on the predicate scan).
pub fn value_to_display(val: &Value) -> String {
    let val = collapse_array_for_display(val);
    match &*val {
        Value::Number(n) => default_number_string(*n),
        Value::Text(s) => s.to_string(),
        Value::Boolean(b) => if *b { "TRUE" } else { "FALSE" }.into(),
        Value::Null => String::new(),
        // NOT `format!("{}", e)`: the rendering boundary speaks Excel's error
        // vocabulary, which is narrower than the engine's diagnostic one.
        Value::Error(e) => error_display_token(e).into_owned(),
        // Unreachable: collapsed above. Defensive fallback.
        Value::Array(_) => String::new(),
        // Lambdas are transient evaluator state — they never get persisted
        // into a cell. A defensive empty string keeps the boundary safe if
        // one ever leaks through.
        Value::Lambda(_) => String::new(),
    }
}

/// Conditional formatting rule. Multiple rules apply in order — the first
/// match wins. If no rule matches, the cell uses its base CellFormat.
#[derive(Clone, Debug, PartialEq)]
pub struct ConditionalRule {
    pub condition: Condition,
    /// Style overrides applied when `condition` is true. Only the fields
    /// you set actually override the base format; `None` means inherit.
    pub overrides: StyleOverrides,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Condition {
    /// Numeric comparison against a constant.
    GreaterThan(f64),
    GreaterOrEqual(f64),
    LessThan(f64),
    LessOrEqual(f64),
    Equals(f64),
    /// Numeric within an inclusive range.
    Between(f64, f64),
    /// Cell value is an error (#DIV/0!, #VALUE!, etc.)
    IsError,
    /// Cell value is empty / Null.
    IsEmpty,
    /// Cell text contains a substring (case-insensitive).
    ContainsText(String),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StyleOverrides {
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub color: Option<String>,
    pub background: Option<String>,
}

impl ConditionalRule {
    pub fn matches(&self, v: &Value) -> bool {
        match &self.condition {
            Condition::GreaterThan(t) => num_pred(v, |n| n > *t),
            Condition::GreaterOrEqual(t) => num_pred(v, |n| n >= *t),
            Condition::LessThan(t) => num_pred(v, |n| n < *t),
            Condition::LessOrEqual(t) => num_pred(v, |n| n <= *t),
            Condition::Equals(t) => num_pred(v, |n| n == *t),
            Condition::Between(lo, hi) => num_pred(v, |n| n >= *lo && n <= *hi),
            Condition::IsError => matches!(v, Value::Error(_)),
            Condition::IsEmpty => matches!(v, Value::Null),
            Condition::ContainsText(needle) => match v {
                Value::Text(s) => s.to_lowercase().contains(&needle.to_lowercase()),
                _ => false,
            },
        }
    }
}

fn num_pred(v: &Value, f: impl Fn(f64) -> bool) -> bool {
    match v {
        Value::Number(n) => f(*n),
        Value::Boolean(true) => f(1.0),
        Value::Boolean(false) => f(0.0),
        _ => false,
    }
}

/// Apply rules in order to a value. Returns the merged style — base format
/// with overrides from the first matching rule. Stable order: rules earlier
/// in the slice win when multiple match.
pub fn apply_rules(base: &CellFormat, rules: &[ConditionalRule], v: &Value) -> CellFormat {
    let mut out = base.clone();
    for rule in rules {
        if rule.matches(v) {
            if let Some(b) = rule.overrides.bold {
                out.bold = b;
            }
            if let Some(i) = rule.overrides.italic {
                out.italic = i;
            }
            if rule.overrides.color.is_some() {
                out.color = rule.overrides.color.clone();
            }
            if rule.overrides.background.is_some() {
                out.background = rule.overrides.background.clone();
            }
            break; // first match wins
        }
    }
    out
}

#[cfg(test)]
#[path = "format_tests.rs"]
mod tests;
