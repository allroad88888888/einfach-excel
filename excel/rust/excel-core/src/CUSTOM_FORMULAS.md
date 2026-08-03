# Custom formulas (Wave 8)

Host-pluggable formula functions, used by the WASM bridge to expose
JS-defined callbacks as cell-level functions: `=MYTAX(B1)` calls the
JS function the host registered under `"MYTAX"`.

## Architecture

```
=MYTAX(B1)
      │
      ▼  parsed (eagerly or on first read) to
      │  Expr::FuncCall { name: "MYTAX", args: [...] }
      │
      ▼  formula facade → formula-inner derived atom → AtomFormulaProvider
      │
      ▼  eval_named_call:
      │    1. provider.lookup_named("MYTAX")        → None  (not a defined LAMBDA)
      │    2. eagerly evaluate args to Vec<Value>   (errors short-circuit)
      │    3. provider.call_custom("MYTAX", &args)  → Option<Value>
      │
      ▼  WorkbookAtomContext::call_custom (sheet.rs)
      │    → depend on custom-registry epoch in the active ReadArgs
      │    → registry.lookup(name, args)
      │
      ▼  WasmCustomFormulaRegistry::lookup (wasm/lib.rs)
      │    → marshal args: Value → JsValue
      │    → js_sys::Function::call1(undefined, &js_args)
      │    → marshal return: JsValue → Value
      │
      ▼  JS callback (host-supplied)
           (args) => args[0] * 0.2
```

`WorkbookEvalProvider` still supports top-level, non-cell evaluation such as
defined-name construction. It is not the dependency or value authority for a
formula cell.

## Precedence (engine side)

Within `eval_func`, name resolution is tried in this order:

1. **Built-in dispatch** — the giant `match` in `eval_func`. Names like
   `SUM`, `IF`, `LAMBDA`, `XLOOKUP` win here.
2. **Defined-name LAMBDA** — `Workbook::define_name("SQUARE", "=LAMBDA(x, x*x)")`
   makes `=SQUARE(5)` resolve to the registry entry. **Only LAMBDA-typed
   defined names participate in this step.**
3. **Host custom formula** — `EvalProvider::call_custom`. The Wave 8
   entry point.
4. **`#NAME?`** — no resolution found.

A host custom formula therefore CANNOT shadow a built-in or a LAMBDA
defined name. `Workbook::define_name` already blocks reserved-name
collisions on the LAMBDA side; the LAMBDA-only filter in `eval_named_call`
preserves the LAMBDA-over-custom precedence.

**Non-LAMBDA defined names do NOT shadow customs.** Earlier shape:
any defined name (range refs, scalar literals like `answer = 42`) would
consume the call site and either error or fall through to `#VALUE!`. Post-
review fix: non-LAMBDA defined names are only consulted by bare
`Expr::Name` (`=MYRANGE` returns the range, `=answer` returns 42); a
call-shaped expression `=MYFUNC(...)` only matches LAMBDA defined names
at this site, otherwise it falls through to the custom registry. This is
what lets a host register `MYFUNC` as a custom callback even if the
workbook happens to also carry `MYFUNC = $A$1:$B$10` as a range alias.

## Trait surface (engine side)

```rust
// eval.rs
pub trait CustomFunctionRegistry: Send + Sync + std::fmt::Debug {
    fn lookup(&self, name: &str, args: &[Value]) -> Option<Value>;
}

pub trait EvalProvider {
    // ... existing methods ...
    fn call_custom(&self, _name: &str, _args: &[Value]) -> Option<Value> {
        None
    }
}

// workbook.rs
impl Workbook {
    pub fn set_custom_function_registry(
        &mut self,
        registry: Option<Arc<dyn CustomFunctionRegistry>>,
    );
    pub fn custom_function_registry(&self) -> Option<Arc<dyn CustomFunctionRegistry>>;
    pub fn invalidate_all_formulas_for_custom_function_change(&self);
}
```

Args are always pre-evaluated. The engine errors-short-circuit on any
`Value::Error` arg BEFORE invoking `call_custom`, so registry
implementations never see `Value::Error` in `args`.

## WASM bridge

```rust
// wasm/src/lib.rs
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "registerCustomFormula")]
    pub fn register_custom_formula(&mut self, name: String, callback: js_sys::Function);

    #[wasm_bindgen(js_name = "unregisterCustomFormula")]
    pub fn unregister_custom_formula(&mut self, name: &str) -> bool;

    #[wasm_bindgen(js_name = "customFormulaCount")]
    pub fn custom_formula_count(&self) -> u32;

    #[wasm_bindgen(js_name = "customFormulaNames")]
    pub fn custom_formula_names(&self) -> JsValue;
}
```

### JS callback signature

```ts
type CustomFormulaScalar = number | string | boolean | null
type CustomFormulaArg = CustomFormulaScalar | CustomFormulaArg[][]
type CustomFormulaReturn =
  | number
  | string                  // text cell, OR an Excel error token like "#DIV/0!"
  | boolean
  | null                    // → Value::Null
  | undefined               // → Value::Null
  | { error: string }       // structured Excel error, e.g. { error: "#DIV/0!" }
  | CustomFormulaCell[][]   // 2-D → Value::Array → spills (see below)
type CustomFormulaCell = CustomFormulaScalar | { error: string }
type CustomFormulaFn = (args: CustomFormulaArg[]) => CustomFormulaReturn
```

### Marshaling

`Value` → `JsValue` (args passed to JS):
- `Number(f64)`        → `number`
- `Text(String)`       → `string`
- `Boolean(bool)`      → `boolean`
- `Null`               → `null`
- `Error(e)`           → `string` like `"#DIV/0!"` (in practice never reaches
                          a custom callback — engine short-circuits errored args)
- `Array(arr)`         → 2-D `Array<Array<...>>` (row-major)
- `Lambda(_)`          → `null` (lambdas don't flow into custom calls)

`JsValue` → `Value` (return from JS):
- `number` (finite)    → `Number`
- `number` (NaN/Inf)   → `Error(Overflow)`  i.e. `#NUM!`
- `string`             → `Text`, EXCEPT the Excel error tokens which
                          round-trip back as `Error(_)` (see below).
- `boolean`            → `Boolean`
- `null` / `undefined` → `Null`
- `{ error: "TOKEN" }` → `Error(_)` parsed from `TOKEN`. Unknown tokens
                          → `Error(InvalidValue)` (`#VALUE!`).
- `Array` (2-D)        → `Array(arr)` (row-major) → **spills**. Shape and
                          element rules in "Array returns" below.
- anything else        → `Error(WrongType)`. **Cell shows `#VALUE!`** —
                          `WrongType` is an internal diagnostic variant, not
                          a displayable code (see "Internal vs displayed
                          codes" below).
- throwing             → `Error(InvalidValue)` (`#VALUE!`). Cell shows
                          `#VALUE!`; wasm instance survives.

The two directions share one mapping: element conversion inside an array
return recurses through the very same `js_to_value`, so a number / text /
boolean / `null` / error token / `{ error }` means exactly what it means at
the top level (including the 1 MB per-string cap, which therefore applies
per element).

### Array returns (dynamic arrays)

`=MYGRID()` whose callback returns `[[1,2],[3,4]]` fills a 2x2 rectangle.
The conversion (`js_array_to_value` in `wasm/src/lib.rs`) produces an
ordinary `Value::Array`, and **everything after that is the existing
dynamic-array machinery** — the anchor holds the array, targets are derived
atoms, obstructions raise `#SPILL!`, clearing the obstruction revives the
region. There is no custom-formula-specific spill code; see
[ADR 0006](../../../../docs/decisions/0006-spill-region-write-semantics.md).

Shape rules, chosen to mirror the ARG direction (which always hands the
callback a nested row-major array) rather than to invent a second mapping:

| return | result | why |
| --- | --- | --- |
| `[[1,2],[3,4]]` | 2x2 spill | the canonical form |
| `[[5]]` | 1x1 array | same as `=SEQUENCE(1,1)`; scalar contexts collapse it |
| `[1,2,3]` (1-D) | `#VALUE!` | deliberate: this engine will not guess row vs column — write `[[1,2,3]]` or `[[1],[2],[3]]`. Apps Script *does* guess (row); Office.js does not. See "Known limits". |
| `[[1,2],[3]]` (ragged) | `#VALUE!` | **never** silently padded |
| `[]` / `[[]]` | `#CALC!` | same answer `FILTER` gives for an empty result |
| `[[[1]]]` (3-D) | `#VALUE!` | cells must be scalars |
| more than 1_048_576 cells | `#VALUE!` | see cap below |

Every rejection also logs a `console.warn` naming the offending row /
size, because the cell can only carry a token.

**Size cap.** An array return is bounded by
`einfach_excel_core::DYNAMIC_ARRAY_CELL_CAP` — 1_048_576 cells, the Excel
max-row count. This is the *same* constant `SEQUENCE`, `MAKEARRAY`, `MAP`
and `MMULT` already gate on (it was made `pub` for this), deliberately
rather than a fresh constant: a host callback must not be able to mint a
shape no built-in can, or every downstream spill guard would need two
limits. The check reads only `length` and runs **before** allocation, so
returning a two-million-row array costs a warning, not a worker OOM.

**Async parity.** `resolveAsyncCustomCall` marshals through the same
`js_to_value`, so an `isAsync: true` callback may resolve an array and it
spills identically. `Workbook::resolve_async_custom_call` re-projects the
observing array formulas after the settle write — a settle is a bare
`Store::set` that reaches no mutation entry point, so without that step
arrays would spill when returned synchronously and silently fail to spill
when resolved asynchronously.

### Error tokens accepted from a callback

`#NULL!`, `#DIV/0!`, `#N/A`, `#REF!`, `#VALUE!`, `#NAME?`, `#NUM!`,
`#CYCLE!`, `#TYPE!`, `#ARGS!`, `#SPILL!`, `#CALC!`.

These are the tokens `error_token_to_value_error` accepts, i.e. what a
callback may RETURN. It is not the list of what a cell can SHOW — see
below. (`#BUSY!` is accepted by the token parser but demoted to `#VALUE!`
on the custom-return path; it is reserved for the async pending state.)

### Internal vs displayed codes

Three codes in the engine's vocabulary have no Excel counterpart. The
normative registry — which of them collapse at the rendering boundary, and
why — is the doc comment on `format::error_display_token`
(`excel/rust/excel-core/src/format.rs`), because that function *is* the
boundary. Its TypeScript twin is
`excel/solid-excel/src-vnext/adapter/error-display-token.ts`. Summary:

| internal code | shown in a cell | disposition |
| --- | --- | --- |
| `#TYPE!` (`WrongType`) | `#VALUE!` | collapsed |
| `#ARGS!` (`WrongArgCount`) | `#VALUE!` | collapsed |
| `#CYCLE!` (`CyclicRef`) | `#CYCLE!` | **deliberate extension — kept** |

Returning `{ error: "#TYPE!" }` therefore does NOT put `#TYPE!` in the cell,
and `{ error: "#ARGS!" }` does not put `#ARGS!` in one. Both variants are
kept internally because they say *which* check rejected the call — the ~350
built-in argument-type guards and the marshaling fallback above raise
`WrongType`, the arity guards raise `WrongArgCount` — but every rendering
boundary maps them through `format::error_display_token`, which answers
`#VALUE!`. For `#ARGS!` that is also the closest honest answer: Excel
rejects a wrong argument count at *entry time* with a dialog, so it has no
cell error code for the case at all.

`#CYCLE!` goes the other way and is **intentionally not aligned with Excel**.
Excel displays `0` plus a status-bar warning for a circular reference, which
buries a real bug inside a plausible number; a distinct searchable code is
more useful, and this is the one place the engine takes that trade. Treat it
as a decision, not a gap.

Consequence for hosts:

- `{ error: "#TYPE!" }`, `{ error: "#ARGS!" }` and `{ error: "#VALUE!" }`
  are **indistinguishable in the UI**. All three cells read `#VALUE!`.
  Prefer `#VALUE!` in new host code; the other two are accepted only so old
  formula text and old snapshots keep parsing.
- A host asserting on cell text must expect `#VALUE!`, never `#TYPE!` or
  `#ARGS!`. It must still expect `#CYCLE!` for circular references.
- A host round-tripping a cell through `snapshotRangeSparse` /
  `snapshot_persistence_v1` still sees the tokens `#TYPE!` / `#ARGS!` on the
  wire: those are serialization channels and speak the internal vocabulary so
  a restore reproduces the exact variant it captured. Display and
  serialization are deliberately different vocabularies; do not "unify" them
  by widening the display side.
- `ERROR.TYPE` grades both `#TYPE!` and `#ARGS!` as `3`, i.e. `#VALUE!`'s
  number, so the collapse leaks no information the host could otherwise see.

### Registry invalidation

`register_custom_formula` (even when replacing an existing name) and
`unregister_custom_formula` both call
`Workbook::invalidate_all_formulas_for_custom_function_change`. The method
publishes the custom-registry version root in the workbook Store. Materialized
formula-inner atoms that previously called the registry recorded an edge to
that root and re-derive through normal Store propagation. Never-read formulas
remain lazy, and formulas that never consult the custom registry have no edge
to publish through.

The version root is deliberately coarse. Registering N customs separately can
publish N times to already-materialized custom-dependent formulas. If a
benchmark shows startup churn matters, add a batch WASM API that mutates the
registry N times and publishes the root once. Do not add a per-name
address-to-formula map: Store dependency edges remain the only invalidation
authority.

## Async custom formulas (Wave 8.2)

A name registered ASYNC (`registerCustomFormulaAsync` on the wasm bridge;
`registerCustomFormula(name, source, { isAsync: true })` on the worker
RPC / backend port / `CustomFormulaRegistration.isAsync` on the UI
registry atom) is **never dispatched through `lookup` during
evaluation**. Evaluation stays synchronous; the waiting happens on the
worker event loop:

1. **Eval**: `WorkbookAtomContext::call_custom` routes async names to a
   memo keyed by the canonical `(name, args)` serialization. A hit
   returns the per-call result atom's value; a miss creates the atom
   holding `Value::Error(Busy)` (`#BUSY!`), enqueues a
   `PendingAsyncCustomCall`, and returns `#BUSY!`. The calling formula
   depends on the result atom either way, and `#BUSY!` propagates to
   dependents through the normal error short-circuit. Note `IFERROR`
   treats `#BUSY!` like any other error and will swallow the pending
   state.
2. **Drain**: after every mutation/read entry point returns, the host
   calls `Workbook::take_pending_async_custom_calls()`
   (`drainAsyncCustomRequests` across wasm). The worker invokes its
   locally-compiled callback (AsyncFunction; the callback never crosses
   into wasm), awaits it, and…
3. **Settle**: …reports through `Workbook::resolve_async_custom_call
   (call_id, value)` (`resolveAsyncCustomCall`). That is a plain
   `Store::set` on the result atom — outside any custom-call frame, so
   the re-entrancy guard does not fire — and Store propagation
   recomputes exactly the observers. Settle values marshal with the
   sync return rules (`js_to_value`): error tokens / `{ error }` round-
   trip, **2-D arrays spill exactly as on the sync path**, nested
   Promises are already awaited flat by the worker, and a
   returned `#BUSY!` demotes to `#VALUE!` (returning the reserved
   pending token would hang the cell forever). Worker-side
   throw/reject maps to `{ error: "#VALUE!" }` — there is no separate
   reject API. Because a settle write reaches no mutation entry point,
   `Workbook::resolve_async_custom_call` explicitly re-projects the array
   formulas observing the settled atom (the same reverse-dependents →
   `recompute_array_formulas_in` pipeline every write path uses);
   without that step an async array would land in the anchor and never
   spill, while the identical value returned synchronously would.

**Memoization contract (the load-bearing API rule)**: one `(name, args)`
pair executes the callback ONCE, and the settled value is reused until
the NEXT registry change (any register/unregister/replace). There is no
TTL and no manual refresh in v1 — async customs suit deterministic-
per-args computations (pricing models, hashing, worker-side fetch of
immutable resources), NOT live data feeds. To force re-execution,
re-register the name.

**Staleness**: every registry change bumps an internal generation,
clears the pending queue, and resets memoized atoms to `#BUSY!` in
place (atom identity is stable — no subscription rekeying). A settle
whose `call_id` no longer matches is dropped (`Ok(false)`); the
re-armed call gets a fresh `call_id` on the next read. Worker runtimes
add an engine-identity guard on top: replacing the whole workbook
(init/restore) strands in-flight Promises.

**Bounded cache**: `ASYNC_CUSTOM_RESULT_CACHE_CAP = 512` entries,
enforced best-effort at drain time by evicting entries whose result
atom has no dependents and no subscribers (never inside a read frame).

**Volatile-args warning**: `=SLOW(NOW())` mints a new call key on every
recalc — cache churn plus one callback execution per key. The cap
bounds memory, not callback volume. Avoid volatile arguments to async
customs.

**Not supported**: async names inside `define_name` formulas — the
eager defined-name evaluation path has no reactive read context, so it
surfaces `#BUSY!` (`EvalFailed(Busy)`) permanently.

## Limitations (initial cut)

- **Async settles are memoized until registry change.** See § "Async
  custom formulas" — no TTL, no per-name refresh, callbacks must be
  effectively deterministic per args for correct semantics.
- **Range args materialise eagerly.** `=MYTAX(A1:A100)` evaluates the
  range to a 2-D `Value::Array` (row-major) BEFORE crossing the JS
  boundary, and the callback receives a `number[][]` / `(number | string
  | boolean | null)[][]` JS array. The engine does NOT yet introduce a
  Range arg type that gives the callback access to source addresses or
  lazy iteration — large ranges are fully copied into JS.
- **No lambda args.** A custom callback that wants higher-order behavior
  (`MAP`-style) needs to be re-architected.
- **Array returns must be explicitly 2-D.** A 1-D array is rejected
  rather than guessed as a row or a column, and a ragged array is
  rejected rather than padded. See § "Array returns".

  This is a **decision with a counterparty**, not a self-evident rule:
  Google Apps Script's custom functions *do* assign a meaning to a 1-D
  return (it fills a row). Three reasons this engine still refuses:
  (1) Office.js — the actual Excel host API — requires `any[][]` for
  matrix custom functions; (2) the inbound direction never hands the
  callback a 1-D array, so accepting one on the way back would create a
  second, asymmetric marshaling; (3) widening from "reject" to "guess" is
  backward compatible, the reverse is not. The rejection message spells
  out both spellings so the caller does not have to know any of this.
- **A custom name is statically assumed array-capable.** The spill
  projection is gated by `sheet::expr_may_produce_array`, which cannot
  know host-registered names at compile time, so it now treats *any*
  non-built-in call (`is_builtin_function_name` says no) as possibly
  array-producing. That is an over-approximation: `#NAME?` typos and
  LAMBDA defined-name calls also take the eager re-eval path. Cost is one
  eager evaluation of a formula the mutation already invalidated;
  correctness is unaffected because `recompute_array_formula` discards
  non-array results. `source_may_produce_array` (the parse-free bulk-install
  scan) is widened in lockstep or the bulk path would silently drop spills.
- **Registry publication is coarse.** A change re-runs every materialized
  formula that consulted the custom registry, even if it called another name.
  Batch registry changes before publishing if measured churn warrants it.
- **No mutation during callback execution.** See § "No mutations during
  callback" below.
- **String return capped at 1 MB.** A callback returning a larger string
  surfaces `#VALUE!` and logs to `console.warn`.
- **Single-threaded only.** `WasmCustomFormulaRegistry` is `Send + Sync`
  via an `unsafe impl` gated on `cfg(not(target_feature = "atomics"))`.
  Enabling wasm threads (wasm-bindgen-rayon) flips off the impl and the
  registry will fail to satisfy the `CustomFunctionRegistry` bound at
  compile time — the unsoundness surfaces as a build error rather than
  silent UB. Re-enabling threads requires re-architecting around a
  worker-bound channel or `SendWrapper`.

## No mutations during callback

A host custom-formula JS callback **MUST NOT** mutate the workbook while
it runs. The engine enforces this via the `Workbook::is_inside_custom_call`
re-entrancy guard:

1. `WorkbookAtomContext::call_custom` (formula cells) and
   `WorkbookEvalProvider::call_custom` (top-level evaluation) enter the same
   `CustomCallScope`. It bumps `Workbook::custom_call_depth` for the duration
   of the JS callback. The scope's `Drop` impl decrements on exit, so a thrown
   JS exception still cleans up the counter.
2. Every public mutation entry point on `Workbook` (`set_cell`,
   `clear_cell`, `set_formula`, `try_set_*`, `define_name`,
   `undefine_name`, `set_custom_function_registry`, `add_sheet`,
   `rename_sheet`, `remove_sheet`, `move_sheet`, `bulk_load`'s loader
   `set_cell` / `set_formula` / `clear_cell` methods) checks the
   guard and rejects (via `Err(SheetError::MutationDuringCustomCall)` /
   `Err(WorkbookError::MutationDuringCustomCall)` on the fallible
   variants, silent no-op on the infallible ones).

**Why**: a mutation inside the callback can re-enter the same shared Store
while its formula-inner derived atom is computing. That would violate the
Store's read/write and dependency-commit invariants and could publish a value
from an inconsistent workbook snapshot. Disallowing mutations keeps one
formula evaluation atomic with respect to workbook state.

**Workarounds**: callbacks that need to "write back" should return a
value and let the host write it after the read completes. The host has
full access to the workbook through `&mut WasmWorkbook` outside callback
frames.

## Security model

The WASM bridge compiles host-supplied JS source via `new Function('args',
source)` (see `excel/solid-excel/src-vnext/adapter/worker-custom-formulas.ts`).
This boundary is **NOT a privilege sandbox**:

- `new Function` sandboxes only the *lexical closure*. The compiled
  function cannot reach that module's local variables, but it
  has full access to the worker's global scope: `self`, `postMessage`,
  `fetch`, `importScripts`, `indexedDB`, the WASM workbook handle, etc.
- Source registered through this path is therefore **host-trusted
  code**, not untrusted user input. Acceptable inputs: developer code
  shipped with the app, formulas loaded from a trusted backend, a
  curated registry of pre-vetted formulas. **Unacceptable** inputs:
  arbitrary strings typed by an end user into a UI "JavaScript formula
  editor" field.

**A future user-input formula editor MUST**:

- Run user code in an iframe sandbox with `sandbox="allow-scripts"` (no
  `allow-same-origin`) so the iframe's globals are a separate origin.
- Communicate via `postMessage` with structured-clone-only payloads —
  never share objects, never `eval`/`new Function` the result.
- Forward calls back to the worker through that channel rather than
  letting the user code touch the WASM handle directly.

The current Wave 8 registry deliberately omits this iframe layer because
the only callers are app-internal. Adding it is a separate arc and
requires reworking the callback marshaling to be async.

## Tests

Engine-side:
- `excel/rust/excel-core/src/eval.rs` — `eval::tests::custom_function_*` (5 unit
  tests covering dispatch, eager arg eval, case insensitivity, error
  propagation, precedence vs defined-name LAMBDA).

WASM-side (both split out of `tests/web.rs`, both driven by
`wasm-pack test --node`):
- `excel/rust/wasm/tests/custom_formula_web.rs` — registration lifecycle
  and scalar returns (7 `#[wasm_bindgen_test]`): tax round-trip, case
  insensitivity, unregister → `#NAME?`, throw → `#VALUE!`,
  string/error-token returns, replacement via re-register, count probe.
- `excel/rust/wasm/tests/custom_formula_array_web.rs` — the array return
  matrix (6 tests): 2-D spill, element types, shape rejections (1-D,
  ragged, 3-D, empty), the size cap, `#SPILL!` collision + revival, and
  the async array settle.
- `excel/rust/wasm/tests/common/mod.rs` — shared `make_js_fn` scaffold.

  Both files deliberately **omit** `wasm_bindgen_test_configure!(run_in_browser)`,
  unlike `web.rs`. `web.rs` needs a real browser because it pins
  `queueMicrotask` event-loop ordering and panic-hook survival; these are
  synchronous engine calls with identical node semantics, so they run with
  no chromedriver dependency.
- `excel/rust/wasm/src/lib.rs` § `mod tests` —
  `custom_formula_returning_array_spills_through_the_existing_path`. A
  NATIVE test: it registers a Rust `CustomFunctionRegistry` returning
  `Value::Array` directly, so it isolates "does the engine spill a custom
  formula's array" from "can JS build one" (`JsValue` cannot be
  constructed off wasm32). This is the test that catches a regression in
  the `expr_may_produce_array` gate.
