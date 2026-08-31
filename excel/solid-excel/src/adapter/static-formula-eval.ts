import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { errorDisplayToken } from './error-display-token'
import { Parser } from './static-formula/parser'
import { tokenize } from './static-formula/tokenizer'
import type { RangeRef } from './static-formula/types'
import type { Value } from './static-formula/value'

export type EvalResult = { kind: 'number'; value: number } | { kind: 'error'; code: string }

export interface EvalCellLookup {
  get(row: number, col: number): DisplayCell | undefined
  resolveStructuredRef?: StructuredRefResolver
  hiddenRows?: ReadonlySet<number>
  filterHiddenRows?: ReadonlySet<number>
}

export interface EvalOrigin {
  readonly row: number
  readonly col: number
}

export type StructuredRefResolution =
  | { readonly kind: 'range'; readonly ref: RangeRef }
  | { readonly kind: 'error'; readonly code: string }
  | null

export type StructuredRefResolver = (
  tableName: string | null,
  inner: string,
  origin: EvalOrigin | null,
) => StructuredRefResolution

export type { RangeRef } from './static-formula/types'
export { rewriteStructuredRefsInFormula, type StructuredRefRewriteSpec } from './static-formula/structured-reference'

export function evaluateFormula(
  formula: string,
  lookup: EvalCellLookup,
  stack: Set<string> = new Set(),
  origin?: EvalOrigin,
): Value {
  const body = formula.startsWith('=') ? formula.slice(1) : formula
  const tokens = tokenize(body, lookup.resolveStructuredRef, origin)
  if (!tokens) return '#ERROR!'
  const parser = new Parser(
    tokens,
    (row, col) => resolveCellValue(lookup, row, col, stack),
    (row, col) => isBlankCell(lookup, row, col),
    lookup.hiddenRows,
    lookup.filterHiddenRows,
  )
  return parser.parse()
}

/** True when the cell holds neither a formula nor any primitive text/number. */
function isBlankCell(lookup: EvalCellLookup, row: number, col: number): boolean {
  const cell = lookup.get(row, col)
  if (!cell) return true
  if (cell.formula) return false
  return cell.displayValue === ''
}

function resolveCellValue(
  lookup: EvalCellLookup,
  row: number,
  col: number,
  stack: Set<string>,
): Value {
  const key = `${row}:${col}`
  if (stack.has(key)) return '#CYCLE!'
  const cell = lookup.get(row, col)
  if (!cell) return 0
  if (cell.formula) {
    stack.add(key)
    // A referenced cell's own formula re-anchors on THAT cell, so its
    // `[@Col]` intersects its own row, not the referrer's.
    const result = evaluateFormula(cell.formula, lookup, stack, { row, col })
    stack.delete(key)
    return result
  }
  if (cell.valueKind === 'number') {
    if (Number.isFinite(cell.numericValue)) return cell.numericValue!
    const n = Number(cell.displayValue)
    return Number.isFinite(n) ? n : 0
  }
  if (cell.displayValue === '') return 0
  const n = Number(cell.displayValue)
  return Number.isFinite(n) ? n : cell.displayValue
}

/**
 * THE display boundary of the static evaluator — every static-backend path
 * that turns an evaluation into cell text goes through here. It is where the
 * internal error vocabulary narrows to Excel's: `#TYPE!` and `#ARGS!` render
 * `#VALUE!`, every other code (including the deliberately-kept `#CYCLE!`)
 * renders as itself. `isError` still keys off the raw result, so the
 * classification is unaffected by the token map.
 */
export function formatEvalResult(result: Value): { display: string; isError: boolean } {
  if (typeof result === 'string' && result.startsWith('#')) {
    return { display: errorDisplayToken(result), isError: true }
  }
  if (typeof result === 'number') {
    if (Number.isInteger(result)) return { display: String(result), isError: false }
    // Trim to 6 significant decimals to avoid float noise.
    const rounded = Math.round(result * 1e6) / 1e6
    return { display: String(rounded), isError: false }
  }
  return { display: String(result), isError: false }
}
