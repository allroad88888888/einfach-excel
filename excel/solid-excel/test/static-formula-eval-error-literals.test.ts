/**
 * Error literal test cases for the static formula evaluator.
 *
 * Verifies that the 13 error tokens recognised by the Rust engine
 * (excel/rust/wasm/src/lib.rs → error_token_to_value_error) are correctly
 * tokenised and evaluated by the static evaluator.
 *
 * TWO VOCABULARIES, asserted separately. `evaluateFormula` answers the
 * evaluator's INTERNAL code; `formatEvalResult` is the display boundary and
 * answers what a cell shows. They differ on exactly two tokens — `#TYPE!`
 * and `#ARGS!`, neither of which has an Excel counterpart, both rendering as
 * `#VALUE!`. Assertions below are labelled by which of the two vocabularies
 * they pin; do not "simplify" a parse assertion into a display one or vice
 * versa.
 */

import { describe, expect, it } from '@jest/globals'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import {
  evaluateFormula,
  formatEvalResult,
  type EvalCellLookup,
} from '../src-vnext/adapter/static-formula-eval'

/** Creates a lookup backed by a string-keyed cell map. */
function lookupFrom(map: Record<string, string | number>): EvalCellLookup {
  const cellMap = new Map<string, DisplayCell>()
  for (const [addr, value] of Object.entries(map)) {
    const match = /^([A-Z]+)(\d+)$/.exec(addr)
    if (!match) throw new Error(`bad addr ${addr}`)
    const col = match[1].charCodeAt(0) - 65
    const row = Number(match[2]) - 1
    const raw = String(value)
    cellMap.set(`${row}:${col}`, {
      displayValue: raw,
      formula: raw.startsWith('=') ? raw : undefined,
      valueKind: Number.isFinite(Number(raw)) && raw !== '' ? 'number' : 'text',
    } as DisplayCell)
  }
  return {
    get(row, col) {
      return cellMap.get(`${row}:${col}`)
    },
  }
}

function ev(formula: string, map: Record<string, string | number> = {}) {
  return evaluateFormula(formula, lookupFrom(map))
}

describe('static-formula-eval — error literals', () => {
  it('#REF! evaluates to #REF!', () => {
    expect(ev('=#REF!')).toBe('#REF!')
  })

  it('#REF!+1 propagates the error', () => {
    expect(ev('=#REF!+1')).toBe('#REF!')
  })

  it('1+#REF! propagates the error', () => {
    expect(ev('=1+#REF!')).toBe('#REF!')
  })

  // PARSE + internal code. `#TYPE!` and `#ARGS!` belong here and must stay:
  // the tokenizer has to keep accepting them (stored formula text carries
  // error codes across structural edits), and the evaluator hands the internal
  // code back unchanged. This is NOT an assertion about cell text — see the
  // display block below.
  it.each([
    ['#NULL!'],
    ['#DIV/0!'],
    ['#N/A'],
    ['#REF!'],
    ['#VALUE!'],
    ['#NAME?'],
    ['#NUM!'],
    ['#CYCLE!'],
    ['#TYPE!'],
    ['#ARGS!'],
    ['#SPILL!'],
    ['#CALC!'],
    ['#BUSY!'],
  ])('%s parses and evaluates to the same internal code', (token) => {
    expect(ev('=' + token)).toBe(token)
  })

  // DISPLAY. Every token renders as itself except `#TYPE!` and `#ARGS!`:
  // Excel has neither code, so the rendering boundary collapses both to
  // `#VALUE!` — the twin of
  // `einfach_excel_core::format::error_display_token`. `#CYCLE!` is non-Excel
  // too and is DELIBERATELY left alone (Excel's `0`-plus-warning hides the
  // bug); that row is a pinned decision, not an oversight. The literal
  // expectations matter: asserting only "TS agrees with itself" would let a
  // regression re-widen the display vocabulary unnoticed.
  it.each([
    ['#NULL!', '#NULL!'],
    ['#DIV/0!', '#DIV/0!'],
    ['#N/A', '#N/A'],
    ['#REF!', '#REF!'],
    ['#VALUE!', '#VALUE!'],
    ['#NAME?', '#NAME?'],
    ['#NUM!', '#NUM!'],
    ['#CYCLE!', '#CYCLE!'],
    ['#TYPE!', '#VALUE!'],
    ['#ARGS!', '#VALUE!'],
    ['#SPILL!', '#SPILL!'],
    ['#CALC!', '#CALC!'],
    ['#BUSY!', '#BUSY!'],
  ])('%s displays as %s', (token, display) => {
    expect(formatEvalResult(ev('=' + token))).toEqual({ display, isError: true })
  })

  // The argument-type guards keep the diagnostic code internally and still
  // render `#VALUE!`. SUBTOTAL's function-number check is the static twin of
  // the engine's `fn_subtotal` → `ValueError::WrongType` arm.
  it('SUBTOTAL argument-type guard keeps #TYPE! internally, displays #VALUE!', () => {
    const raw = ev('=SUBTOTAL("x",A1:A3)')
    expect(raw).toBe('#TYPE!')
    expect(formatEvalResult(raw).display).toBe('#VALUE!')
  })

  // Same split for the arity guard — the static twin of the engine's
  // `ValueError::WrongArgCount`. Excel would refuse this edit in the formula
  // bar, so there is no Excel code to show; `#VALUE!` is what the cell reads.
  it('SUBTOTAL arity guard keeps #ARGS! internally, displays #VALUE!', () => {
    const raw = ev('=SUBTOTAL(9)')
    expect(raw).toBe('#ARGS!')
    expect(formatEvalResult(raw).display).toBe('#VALUE!')
  })

  it('error literal in function arg propagates', () => {
    expect(ev('=SUM(#REF!, 5)')).toBe('#REF!')
  })

  it('error literal in comparison propagates', () => {
    expect(ev('=#REF!>5')).toBe('#REF!')
  })

  it('error literal as IF condition propagates', () => {
    expect(ev('=IF(#N/A, 1, 2)')).toBe('#N/A')
  })

  it('unrecognised # token returns #ERROR!', () => {
    expect(ev('=#UNKNOWN!')).toBe('#ERROR!')
  })
})
