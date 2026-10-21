/**
 * Type contracts for the formula-function registry.
 *
 * A `FormulaFunctionSpec` describes one Excel-style function name (e.g.
 * "SUM"), its argument signature, and a short summary used to power
 * autocomplete + signature tooltips.
 *
 * Specs are UI metadata — no evaluator implementation. The maintained
 * React path calculates through Rust/WASM; the real Worker catalog E2E
 * verifies that every suggested function has a native implementation.
 */

export interface FormulaFunctionArg {
  /** Display name shown in the signature tooltip (e.g. 'number1', 'range'). */
  name: string
  description?: string
  descriptionZh?: string
  /**
   * Whether the argument is optional. Optional args are wrapped in square
   * brackets in the rendered signature: `SUM(number1, [number2], ...)`.
   */
  optional?: boolean
  /**
   * Whether the slot accepts a comma-separated *repeating* tail
   * (e.g. SUM's second-and-beyond args). Only meaningful on the final
   * arg in the spec.
   */
  repeats?: boolean
}

export interface FormulaFunctionSpec {
  /** False means argument help is unavailable, not that this function takes no arguments. */
  signatureAvailable?: boolean
  category?: string
  /** Canonical function name, upper-case (e.g. 'SUM'). */
  name: string
  /**
   * Ordered argument list. Used to render the signature and to highlight
   * the active arg based on the comma count between '(' and the caret.
   */
  args: FormulaFunctionArg[]
  /** One-line description shown beside the name in the dropdown. */
  summary: string
  summaryZh?: string
  /** One prototype group, with any fixed arguments after it kept at the end. */
  repeat?: { start: number; length: number; minGroups: number }
  examples?: readonly string[]
  limitations?: readonly { en: string; zh: string }[]
}

/** Actual compiled Rust functions; reserved names remain a separate cross-build policy. */
export interface NativeFunctionCatalog {
  readonly version: 1 | 2
  readonly functions: readonly {
    readonly name: string
    readonly category: string
    readonly note?: string | null
    readonly help?: NativeFormulaHelp
  }[]
}

export interface NativeFormulaHelp {
  readonly summary: string
  readonly summary_zh: string
  readonly args: readonly {
    readonly name: string
    readonly description: string
    readonly description_zh: string
    readonly optional: boolean
    readonly repeats: boolean
  }[]
  /** None may be undefined/omitted at the WASM boundary, or null in native JSON. */
  readonly repeat?: {
    readonly start: number
    readonly length: number
    readonly min_groups: number
  } | null
  readonly examples: readonly string[]
  readonly limitations: readonly { readonly en: string; readonly zh: string }[]
}

/**
 * One row in the autocomplete dropdown — the registry's spec plus the
 * range of characters in the draft that the spec would replace if the
 * user accepts it.
 */
export interface FormulaFunctionSuggestion {
  spec: FormulaFunctionSpec
  /** Inclusive start of the function-name fragment in the draft. */
  fragmentStart: number
  /** Exclusive end of the fragment. */
  fragmentEnd: number
  /** The fragment text (already upper-cased) used for ranking + display. */
  fragment: string
}

/**
 * Live signature state derived from the editing draft + caret. The host
 * renders this as a tooltip below the input.
 */
export interface FormulaFunctionSignatureState {
  spec: FormulaFunctionSpec
  /**
   * Zero-based index into `spec.args`, clamped to the last arg when the
   * user has typed past the formal count (so repeating tails still
   * highlight). -1 only when the caret sits before the first arg, which
   * shouldn't be reachable in practice.
   */
  activeArgIndex: number
}
