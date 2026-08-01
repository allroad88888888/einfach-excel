/**
 * Static evaluator — Excel ARITHMETIC OPERAND SEMANTICS.
 *
 * Sibling of `static-formula-eval.test.ts` (which pins the evaluator's shape:
 * refs, functions, cycles) and of `static-formula-eval-error-literals.test.ts`
 * (which pins the error vocabulary). This file pins ONE thing: what an
 * arithmetic operator does with an operand that is not already a number, plus
 * the postfix `%` operator that shares that coercion.
 *
 * The reference is the pair of REAL engines, not this evaluator's own history:
 *
 *   - Rust   `excel/rust/excel-core/src/eval.rs` `coerce_text_to_number`
 *            (js_trim → empty-string guard → js_numeric_value)
 *   - TS ref `excel/excel-core-ts/src/eval/coerce.ts` `toNumber`
 *            (trim → empty-string guard → Number → isFinite)
 *
 * The empty-string guard is the subtle row and it comes FIRST: `Number('')`
 * is `0`, so without the guard `=1+""` would answer `1` where Excel and both
 * engines answer `#VALUE!`.
 *
 * `0x` / `0b` / `0o` literals are a known engines-vs-Excel divergence that the
 * two engines share deliberately (see the Rust doc comment); this evaluator
 * inherits it for free because it runs on JS `Number()`.
 */

import { describe, expect, it } from '@jest/globals'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'

import { evaluateFormula, type EvalCellLookup } from '../src-vnext/adapter/static-formula-eval'

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

const COERCING: ReadonlyArray<readonly [formula: string, expected: number]> = [
  ['=1+"5"', 6],
  ['="5"*"3"', 15],
  ['="10"-4', 6],
  ['="10"/"4"', 2.5],
  ['="2"^"3"', 8],
  ['=" -5 "+0', -5], // surrounding whitespace is trimmed before parsing
]

describe('static-formula-eval — numeric text coerces in arithmetic', () => {
  for (const [formula, expected] of COERCING) {
    it(`${formula} → ${expected}`, () => {
      expect(ev(formula)).toBe(expected)
    })
  }

  it('non-numeric text is still #VALUE!', () => {
    expect(ev('=1+"x"')).toBe('#VALUE!')
    expect(ev('="x"+"y"')).toBe('#VALUE!')
  })

  it('the empty-string guard runs BEFORE Number(), so =1+"" is #VALUE! not 1', () => {
    expect(ev('=1+""')).toBe('#VALUE!')
    expect(ev('=1+"   "')).toBe('#VALUE!')
  })

  it('an errored operand still wins over coercion', () => {
    expect(ev('=#REF!+"5"')).toBe('#REF!')
    expect(ev('="5"+#N/A')).toBe('#N/A')
  })

  it('comparison keeps string semantics — it does NOT coerce', () => {
    // Excel compares text to number by TYPE ORDER, never by parsing the text.
    expect(ev('="5"=5')).toBe(0)
  })
})

describe('static-formula-eval — unary minus', () => {
  it('negates numeric text instead of silently dropping the sign', () => {
    expect(ev('=-"5"')).toBe(-5)
  })

  it('unary plus coerces too', () => {
    expect(ev('=+"5"')).toBe(5)
  })

  it('non-numeric text under unary minus is #VALUE!', () => {
    expect(ev('=-"abc"')).toBe('#VALUE!')
  })

  it('propagates an errored operand verbatim', () => {
    expect(ev('=-#DIV/0!')).toBe('#DIV/0!')
  })
})

const PERCENT: ReadonlyArray<readonly [formula: string, expected: number]> = [
  ['=50%', 0.5],
  ['=-50%', -0.5],
  ['=50%%', 0.005], // stacking is legal in Excel
  ['=1+2%', 1.02],
  ['=A1%', 0.05],
]

describe('static-formula-eval — postfix percent', () => {
  for (const [formula, expected] of PERCENT) {
    it(`${formula} → ${expected}`, () => {
      expect(ev(formula, { A1: 5 })).toBeCloseTo(expected, 12)
    })
  }

  it('% binds tighter than ^ — =2^2% is 2^0.02, not (2^2)%', () => {
    expect(ev('=2^2%')).toBe(Math.pow(2, 0.02))
  })

  it('% coerces numeric text like every other arithmetic operand', () => {
    expect(ev('="50"%')).toBe(0.5)
    expect(ev('="x"%')).toBe('#VALUE!')
  })

  it('% is NOT modulo — Excel has no modulo operator', () => {
    // `=10%3` is `(10%)` followed by a stray `3`, i.e. a parse error, and must
    // never quietly answer 1.
    expect(ev('=10%3')).toBe('#ERROR!')
  })
})
