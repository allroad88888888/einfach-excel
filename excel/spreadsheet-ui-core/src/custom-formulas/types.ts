/**
 * Custom user-defined formula contracts (Wave 8).
 *
 * Plain-value boundary types — these MUST stay framework-agnostic and free
 * of any DOM / worker / WASM glue. The Solid (or other) host translates
 * registry mutations into worker RPCs (`register-custom-formula` /
 * `unregister-custom-formula`); the worker `new Function('args', source)`s
 * the body inside its own thread so JS callbacks never need to cross
 * `postMessage`.
 */

/**
 * Scalar leaf of a custom-formula argument. Cells project as
 * `number | string | boolean`; blank cells as `null`.
 */
export type CustomFormulaScalar = number | string | boolean | null

/**
 * Plain-value argument the worker-side body receives.
 *
 * Scalar args (`=MYFN(B2)`) arrive as a `CustomFormulaScalar`. Range
 * args (`=MYFN(A1:B10)`) arrive as a 2-D `ReadonlyArray<ReadonlyArray<scalar>>`
 * (row-major) because the WASM bridge marshals `Value::Array` directly
 * to a nested JS array — see `excel/rust/excel-core/src/CUSTOM_FORMULAS.md`
 * "Marshaling".
 *
 * The `Readonly*` wrappers are TypeScript-only — the underlying arrays
 * are real `Array` instances at runtime, so `.flat()`, `.map()`,
 * `.reduce()` etc. work normally; the wrappers just discourage
 * accidental in-place mutation of WASM-owned data.
 */
export type CustomFormulaArg =
  | CustomFormulaScalar
  | ReadonlyArray<ReadonlyArray<CustomFormulaScalar>>

/**
 * Structured error return. `{ error: '#DIV/0!' }` puts that Excel error in
 * the cell without the ambiguity of returning the literal string `'#DIV/0!'`
 * (which a callback might legitimately want as text). Unknown tokens
 * degrade to `#VALUE!`.
 */
export interface CustomFormulaErrorReturn {
  error: string
}

/**
 * Plain-value return shape. `undefined` is treated as a blank result by
 * the engine (same as a `null` return); both forms are accepted because
 * `return` with no value is a common pattern.
 *
 * A **2-D** array return spills: `=MYFN()` returning `[[1,2],[3,4]]` fills
 * a 2x2 rectangle through the engine's normal dynamic-array path (same
 * projection / collision / `#SPILL!` rules as `=SEQUENCE(2,2)`). The shape
 * is deliberately symmetric with `CustomFormulaArg`'s range form — nested
 * rows, row-major — so one mapping serves both directions.
 *
 * Rules worth knowing before returning an array (full list in
 * `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` "Marshaling"):
 * - Rows must be rectangular. A ragged return is `#VALUE!`, never
 *   silently padded.
 * - A 1-D array (`[1,2,3]`) is rejected — the engine will not guess row
 *   vs column. Write `[[1,2,3]]` or `[[1],[2],[3]]`.
 * - An empty array (`[]` / `[[]]`) is `#CALC!`, matching `FILTER`'s
 *   empty result.
 * - Cells must be scalars; nesting deeper than 2-D is `#VALUE!`.
 * - Total cells are capped by the engine's shared dynamic-array limit
 *   (1_048_576, the same gate `SEQUENCE` uses); over-cap is `#VALUE!`.
 *
 * Async registrations (`isAsync: true`) resolve through the SAME
 * marshaling, so an async callback may resolve an array too.
 */
export type CustomFormulaReturn =
  | number
  | string
  | boolean
  | null
  | undefined
  | CustomFormulaErrorReturn
  | ReadonlyArray<ReadonlyArray<CustomFormulaScalar | CustomFormulaErrorReturn>>

/**
 * Compiled local function form. Used by jest tests (no worker) and for
 * the optional `paramLabels` future wave. The Solid host does NOT send
 * this across `postMessage`; it sends `source` and lets the worker
 * `new Function('args', source)` it on register.
 */
export type CustomFormulaFn = (args: CustomFormulaArg[]) => CustomFormulaReturn

/**
 * Registry entry. `source` is the function body — arguments are bound to
 * `args` (Array) inside the worker. The closure-capture hazard is avoided
 * entirely by handing the host a body string rather than a live
 * function, so callers cannot accidentally close over a main-thread
 * variable.
 */
export interface CustomFormulaRegistration {
  /**
   * Excel-style uppercase name. Must match `/^[A-Z][A-Z0-9_.]*$/` and
   * must not shadow a built-in. The registry throws on registration if
   * either rule is violated.
   */
  name: string
  /**
   * Function body source. Bound parameter name is `args` (Array). The
   * worker constructs the live function via `new Function('args',
   * source)` — or the AsyncFunction constructor when `isAsync` is set,
   * in which case the body may `await`.
   */
  source: string
  /**
   * Wave 8.2 — async custom formula. The body compiles through the
   * AsyncFunction constructor and may return a Promise. While the call
   * is in flight the cell shows `#BUSY!` (propagating to dependents);
   * the worker settles the result back into the engine when the
   * Promise resolves. Results are memoized per (name, args) until the
   * NEXT registry change — there is no TTL or manual refresh in v1, so
   * this suits deterministic-per-args calls, not live data feeds.
   */
  isAsync?: boolean
  /** Optional metadata for IntelliSense (Wave 9 surface). */
  description?: string
  /** Optional parameter labels for the function-help popover. */
  paramLabels?: string[]
}

/**
 * Outcome of `validateCustomFormulaName`. Reasons are stable strings so
 * hosts can map them to localized error messages without parsing
 * free-text.
 */
export type CustomFormulaNameValidationReason =
  | 'name-empty'
  | 'name-format'
  | 'name-shadows-builtin'

export type CustomFormulaNameValidation =
  | { ok: true }
  | { ok: false; reason: CustomFormulaNameValidationReason }

/**
 * One store owns one workbook registry lifecycle. Reset clears the
 * active workbook registry; disposal is terminal for that store.
 */
export type CustomFormulaRegistryStatus = 'active' | 'disposed'

export interface CustomFormulaRegistryLifecycle {
  readonly status: CustomFormulaRegistryStatus
  readonly maxEntries: number
  readonly size: number
}

export type CustomFormulaRegistryRejectionReason = 'capacity-reached' | 'registry-disposed'

export type RegisterCustomFormulaOutcome =
  | {
      readonly outcome: 'registered' | 'replaced'
      readonly name: string
      readonly size: number
    }
  | {
      readonly outcome: 'rejected'
      readonly reason: CustomFormulaRegistryRejectionReason
      readonly name: string
      readonly size: number
      readonly maxEntries: number
    }

export type UnregisterCustomFormulaOutcome =
  | {
      readonly outcome: 'removed' | 'not-found'
      readonly name: string
      readonly size: number
    }
  | {
      readonly outcome: 'rejected'
      readonly reason: 'registry-disposed'
      readonly name: string
      readonly size: number
    }

export type ConfigureCustomFormulaRegistryOutcome =
  | {
      readonly outcome: 'configured'
      readonly maxEntries: number
    }
  | {
      readonly outcome: 'rejected'
      readonly reason: 'invalid-limit' | 'limit-below-current-size' | 'registry-disposed'
      readonly maxEntries: number
      readonly currentSize: number
    }

export type ResetCustomFormulaRegistryOutcome =
  | { readonly outcome: 'reset'; readonly clearedEntries: number }
  | {
      readonly outcome: 'rejected'
      readonly reason: 'registry-disposed'
      readonly clearedEntries: 0
    }

export type DisposeCustomFormulaRegistryOutcome =
  | { readonly outcome: 'disposed'; readonly clearedEntries: number }
  | { readonly outcome: 'already-disposed'; readonly clearedEntries: 0 }
