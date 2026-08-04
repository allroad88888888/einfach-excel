use super::*;


/// Host-side custom-formula registry. Lives behind an `Arc<dyn ...>` on
/// the `Workbook` so the formula engine can call out to JS-supplied
/// functions (or any other host code) without `einfach-excel-core` ever
/// learning what `js_sys::Function` is. The wasm crate ships the canonical
/// implementation (`WasmCustomFormulaRegistry`); native tests can supply
/// their own.
///
/// Contract:
///   - `lookup(name, args)` returns `Some(Value)` when a function is
///     registered under `name` (case-insensitive lookup is the host's
///     responsibility — both the wasm registry and the in-file unit-test
///     stubs upper-case keys at insertion AND query). Returns `None` to
///     mean "no function with this name; fall through to `#NAME?`".
///   - Args are already evaluated `Value`s. Per the precedence rule in
///     `eval_named_call`, an error in any arg short-circuits before the
///     registry is consulted, so a host implementation will never see
///     `Value::Error(_)` in `args`.
///   - The host is responsible for catching any panics / exceptions
///     thrown by the underlying callback and turning them into a
///     `Value::Error(_)`. The engine treats `Some(Value::Error(_))` as a
///     successfully-dispatched-but-failed call (the cell shows the error)
///     and does NOT then try the unknown-function fallback.
///
/// `Send + Sync` so a future multi-threaded workbook can keep the
/// registry on the workbook without re-architecting. The single-threaded
/// wasm impl wraps `js_sys::Function` in `SendWrapper` (or equivalent) to
/// satisfy this bound.
pub trait CustomFunctionRegistry: Send + Sync + std::fmt::Debug {
    fn lookup(&self, name: &str, args: &[Value]) -> Option<Value>;

    /// True when `name` is registered as an ASYNC custom formula. Async
    /// functions are never dispatched through `lookup` during evaluation —
    /// the engine memoizes per (name, args) call: a cache miss enqueues a
    /// `PendingAsyncCustomCall` and the cell holds `#BUSY!` until the host
    /// drains the queue, runs the callback on its own event loop, and
    /// writes the result back via `Workbook::resolve_async_custom_call`.
    /// Names default to sync so existing registries are source-compatible.
    fn is_async(&self, _name: &str) -> bool {
        false
    }
}
