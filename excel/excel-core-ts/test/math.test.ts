/**
 * Wave C / C1 — math function tests.
 *
 * Drives each `FunctionImpl` in `src/eval/functions/math.ts` directly with
 * hand-built `Value[]`. No parser, no evaluator, no atoms — these tests
 * verify the per-function contract:
 *   1. happy path (canonical inputs)
 *   2. error propagation (a positional error wins, verbatim)
 *   3. type coercion (string → number, boolean → 0/1, blank → 0)
 *   4. edge case (negative digits / negative dividend / 0^0 / sqrt(-1))
 *
 * Aggregations (SUM/AVERAGE/MIN/MAX/COUNT/COUNTA) additionally cover the
 * Excel "array ignores text, scalar coerces text" split that's easy to
 * regress when a future agent refactors the helpers.
 */

import { describe, expect, test } from '@jest/globals'

import {
  ABS,
  AVERAGE,
  CEILING,
  COUNT,
  COUNTA,
  FLOOR,
  FUNCTIONS,
  INT,
  MAX,
  MIN,
  MOD,
  POWER,
  PRODUCT,
  ROUND,
  ROUNDDOWN,
  ROUNDUP,
  SIGN,
  SQRT,
  SUM,
  SUMPRODUCT,
  TRUNC,
} from '../src/eval/functions/math'
import { keyFor } from '../src/sheet'
import type { EvalContext, FunctionImpl, Value, Workbook } from '../src/types'
import { BLANK } from '../src/types'
import { createWorkbook } from '../src/workbook'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NUM = (n: number): Value => ({ kind: 'number', value: n })
const STR = (s: string): Value => ({ kind: 'string', value: s })
const BOOL = (b: boolean): Value => ({ kind: 'boolean', value: b })
const ERR = (code: '#DIV/0!' | '#N/A' | '#NUM!' | '#REF!' | '#VALUE!'): Value => ({
  kind: 'error',
  code,
})
const ARR = (rows: Value[][]): Value => ({ kind: 'array', value: rows })

// Minimal context. Math functions never read `ctx` (no refs, no ranges,
// no custom-formula dispatch) so we hand them a sentinel that throws on
// any property access — guarantees zero ctx-coupling in implementations.
const ctx: EvalContext = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(`math function unexpectedly read ctx.${String(prop)}`)
    },
  },
) as unknown as EvalContext

function call(fn: FunctionImpl, args: Value[]): Value {
  return fn(args, ctx)
}

// ---------------------------------------------------------------------------
// SUM
// ---------------------------------------------------------------------------

describe('SUM', () => {
  test('happy path: scalar numbers add', () => {
    expect(call(SUM, [NUM(1), NUM(2), NUM(3)])).toEqual(NUM(6))
  })

  test('coerces numeric strings and booleans when passed as scalar args', () => {
    expect(call(SUM, [NUM(1), STR('5'), BOOL(true)])).toEqual(NUM(7))
  })

  test('non-numeric string scalar arg surfaces #VALUE!', () => {
    expect(call(SUM, [NUM(1), STR('abc')])).toEqual(ERR('#VALUE!'))
  })

  test('ignores text / booleans / blanks INSIDE an array (Excel range rule)', () => {
    expect(
      call(SUM, [
        ARR([
          [NUM(1), STR('hello'), BOOL(true)],
          [BLANK, NUM(2), NUM(3)],
        ]),
      ]),
    ).toEqual(NUM(6))
  })

  test('error inside array propagates verbatim', () => {
    expect(call(SUM, [ARR([[NUM(1), ERR('#DIV/0!'), NUM(3)]])])).toEqual(ERR('#DIV/0!'))
  })

  test('first scalar error wins', () => {
    expect(call(SUM, [ERR('#REF!'), ERR('#NUM!'), NUM(1)])).toEqual(ERR('#REF!'))
  })

  test('blank scalar coerces to 0', () => {
    expect(call(SUM, [NUM(5), BLANK])).toEqual(NUM(5))
  })

  test('no args → 0', () => {
    expect(call(SUM, [])).toEqual(NUM(0))
  })
})

// ---------------------------------------------------------------------------
// AVERAGE
// ---------------------------------------------------------------------------

describe('AVERAGE', () => {
  test('happy path', () => {
    expect(call(AVERAGE, [NUM(2), NUM(4), NUM(6)])).toEqual(NUM(4))
  })

  test('range/array: text and blanks not counted in denominator', () => {
    expect(
      call(AVERAGE, [
        ARR([
          [NUM(2), STR('skip'), NUM(4)],
          [BLANK, NUM(6), BOOL(true)],
        ]),
      ]),
    ).toEqual(NUM(4)) // (2+4+6) / 3
  })

  test('scalar coerces string', () => {
    expect(call(AVERAGE, [NUM(10), STR('20'), STR('30')])).toEqual(NUM(20))
  })

  test('error propagates', () => {
    expect(call(AVERAGE, [NUM(1), ERR('#N/A')])).toEqual(ERR('#N/A'))
  })

  test('no numeric values → #DIV/0!', () => {
    expect(call(AVERAGE, [ARR([[STR('a'), STR('b')]])])).toEqual(ERR('#DIV/0!'))
  })

  test('no args → #DIV/0!', () => {
    expect(call(AVERAGE, [])).toEqual(ERR('#DIV/0!'))
  })
})

// ---------------------------------------------------------------------------
// COUNT
// ---------------------------------------------------------------------------

describe('COUNT', () => {
  test('counts only numbers', () => {
    expect(
      call(COUNT, [
        ARR([
          [NUM(1), STR('2'), NUM(3)],
          [BOOL(true), BLANK, NUM(4)],
        ]),
      ]),
    ).toEqual(NUM(3))
  })

  test('scalar string is NOT counted (different from SUM!)', () => {
    expect(call(COUNT, [NUM(1), STR('5'), STR('abc')])).toEqual(NUM(1))
  })

  test('scalar boolean not counted', () => {
    expect(call(COUNT, [NUM(1), BOOL(true), BOOL(false)])).toEqual(NUM(1))
  })

  test('an error written straight into the argument list is skipped too', () => {
    // 这条曾经断言 `ERR('#REF!')`，注释还写着 "matches Excel"。那是错的：
    // MS 文档 COUNT § Remarks —— "Arguments that are error values or text
    // that cannot be translated into numbers are **not counted**"，讲的正是
    // 直接实参。Rust 引擎的 `"COUNT"` 臂也只数 Value::Number、零短路。
    // 也就是说 COUNT 对错误值的态度只有一条：它不是数字，跳过。区域里的
    // 格子如此，写在参数表里的也如此 —— 这里不存在两种形状。
    expect(call(COUNT, [NUM(1), ERR('#REF!')])).toEqual(NUM(1))
    expect(call(COUNT, [ERR('#REF!')])).toEqual(NUM(0))
    // 对照：值档仍然传播，分界是**按函数**不是按数据。
    expect(call(SUM, [NUM(1), ERR('#REF!')])).toEqual(ERR('#REF!'))
  })

  // The shape a real sheet produces: `=COUNT(A1:B3)` over
  // {1, 2, 3, "txt", TRUE, #DIV/0!} — the fixture the SUBTOTAL counting codes
  // use (`phase8-math.test.ts`) and the one pinned across engines in
  // `solid-excel/test/cross-engine-parity-cases.ts`. Excel and the Rust
  // engine answer 3; this engine used to answer `#DIV/0!`.
  test('an error cell inside a range is skipped, not answered', () => {
    const mixed = ARR([
      [NUM(1), NUM(2)],
      [NUM(3), STR('txt')],
      [BOOL(true), ERR('#DIV/0!')],
    ])
    expect(call(COUNT, [mixed])).toEqual(NUM(3))
  })

  // This test used to be called `error inside array propagates (does not
  // silently count as nothing)` and asserted `#VALUE!` — it pinned the bug as
  // if it were the contract. Excel's rule is per FUNCTION, not per data: an
  // error cell is not a NUMBER so COUNT skips it, and is not BLANK so COUNTA
  // (below) tallies it; neither ever hands the error back. Only the SUM tier
  // propagates. Same rule the SUBTOTAL counting codes were pulled onto.
  //
  // Why this differs in shape from the scalar test above: a LITERAL error
  // argument is something the user typed into the formula, while an error
  // inside a range/array is merely a cell that was referenced. At the
  // `FunctionImpl` boundary both arrive as a `Value` with no provenance
  // attached, so the line has to be drawn by SHAPE — scalar arg propagates,
  // array element is skipped. That is exactly where the third implementation
  // (`solid-excel/src-vnext/adapter/static-formula-eval.ts` `aggregateNumeric`)
  // already draws it: `if (name === 'COUNT') continue` on the range branch,
  // `if (isErrLocal(arg)) return arg` on the scalar branch.
  test('an error inside an array is skipped — it is simply not a number', () => {
    expect(call(COUNT, [ARR([[NUM(1), ERR('#VALUE!')]])])).toEqual(NUM(1))
    // Control on the SAME data: the value tier still propagates, so the split
    // is per function, not per fixture.
    expect(call(SUM, [ARR([[NUM(1), ERR('#VALUE!')]])])).toEqual(ERR('#VALUE!'))
  })

  test('no args → 0', () => {
    expect(call(COUNT, [])).toEqual(NUM(0))
  })
})

// ---------------------------------------------------------------------------
// COUNTA
// ---------------------------------------------------------------------------

describe('COUNTA', () => {
  test('counts every non-blank including strings and booleans', () => {
    expect(
      call(COUNTA, [
        ARR([
          [NUM(1), STR('hi'), BOOL(true)],
          [BLANK, NUM(0), STR('')],
        ]),
      ]),
    ).toEqual(NUM(5)) // 1, "hi", TRUE, 0, "" — blank excluded
  })

  test('errors in arrays count as non-blank (Excel keeps the count)', () => {
    // Excel: COUNTA over a range that contains #N/A returns N/A by
    // convention? Actually no — COUNTA counts errors too. We propagate
    // only scalar errors (per Wave C contract). The test below pins
    // the in-array behavior.
    expect(
      call(COUNTA, [ARR([[NUM(1), ERR('#N/A'), NUM(3)]])]),
    ).toEqual(NUM(3))
  })

  test('an error counts — it is emphatically not blank', () => {
    // COUNTA 数的是「非空」，而错误值当然不空。同 Rust 的 `"COUNTA"` 臂：
    // `if !matches!(v, Value::Null) { count += 1 }` —— 一行，没有短路。
    // 注意方向与 COUNT 相反：COUNT 跳过它，COUNTA 计数它。
    expect(call(COUNTA, [NUM(1), ERR('#REF!')])).toEqual(NUM(2))
    expect(call(COUNTA, [ERR('#REF!')])).toEqual(NUM(1))
  })

  test('all blanks → 0', () => {
    expect(call(COUNTA, [BLANK, BLANK, ARR([[BLANK, BLANK]])])).toEqual(NUM(0))
  })
})

// ---------------------------------------------------------------------------
// MIN / MAX
// ---------------------------------------------------------------------------

describe('MIN', () => {
  test('happy path', () => {
    expect(call(MIN, [NUM(3), NUM(1), NUM(2)])).toEqual(NUM(1))
  })

  test('ignores text inside array', () => {
    expect(call(MIN, [ARR([[NUM(5), STR('huge'), NUM(2)]])])).toEqual(NUM(2))
  })

  test('coerces scalar string', () => {
    expect(call(MIN, [NUM(5), STR('-3')])).toEqual(NUM(-3))
  })

  test('error propagates', () => {
    expect(call(MIN, [NUM(1), ERR('#NUM!')])).toEqual(ERR('#NUM!'))
  })

  test('no numeric values → 0 (Excel quirk)', () => {
    expect(call(MIN, [ARR([[STR('a'), STR('b')]])])).toEqual(NUM(0))
  })

  test('negative numbers handled', () => {
    expect(call(MIN, [NUM(-5), NUM(-1), NUM(-10)])).toEqual(NUM(-10))
  })
})

describe('MAX', () => {
  test('happy path', () => {
    expect(call(MAX, [NUM(3), NUM(1), NUM(2)])).toEqual(NUM(3))
  })

  test('ignores text inside array', () => {
    expect(call(MAX, [ARR([[NUM(5), STR('huge'), NUM(2)]])])).toEqual(NUM(5))
  })

  test('coerces scalar boolean', () => {
    expect(call(MAX, [NUM(-1), BOOL(true)])).toEqual(NUM(1))
  })

  test('error propagates', () => {
    expect(call(MAX, [ERR('#DIV/0!'), NUM(100)])).toEqual(ERR('#DIV/0!'))
  })

  test('no numeric values → 0 (Excel quirk)', () => {
    expect(call(MAX, [ARR([[BLANK, STR('x')]])])).toEqual(NUM(0))
  })
})

// ---------------------------------------------------------------------------
// ROUND family
// ---------------------------------------------------------------------------

describe('ROUND', () => {
  test('happy path positive digits', () => {
    expect(call(ROUND, [NUM(2.345), NUM(2)])).toEqual(NUM(2.35))
  })

  test('rounds half AWAY from zero (Excel rule, not JS rule)', () => {
    expect(call(ROUND, [NUM(2.5), NUM(0)])).toEqual(NUM(3))
    expect(call(ROUND, [NUM(-2.5), NUM(0)])).toEqual(NUM(-3))
    expect(call(ROUND, [NUM(0.145), NUM(2)])).toEqual(NUM(0.15))
    expect(call(ROUND, [NUM(-0.145), NUM(2)])).toEqual(NUM(-0.15))
  })

  test('negative digits round to left of decimal', () => {
    expect(call(ROUND, [NUM(1234.567), NUM(-2)])).toEqual(NUM(1200))
  })

  test('error propagates from any arg', () => {
    expect(call(ROUND, [ERR('#VALUE!'), NUM(2)])).toEqual(ERR('#VALUE!'))
    expect(call(ROUND, [NUM(1), ERR('#NUM!')])).toEqual(ERR('#NUM!'))
  })

  test('coerces string arg', () => {
    expect(call(ROUND, [STR('3.14159'), NUM(2)])).toEqual(NUM(3.14))
  })

  test('requires digits argument', () => {
    expect(call(ROUND, [NUM(2.7)])).toEqual(ERR('#VALUE!'))
    expect(call(ROUNDUP, [NUM(2.1)])).toEqual(ERR('#VALUE!'))
    expect(call(ROUNDDOWN, [NUM(2.9)])).toEqual(ERR('#VALUE!'))
  })
})

describe('ROUNDUP', () => {
  test('always away from zero', () => {
    expect(call(ROUNDUP, [NUM(2.1), NUM(0)])).toEqual(NUM(3))
    expect(call(ROUNDUP, [NUM(-2.1), NUM(0)])).toEqual(NUM(-3))
  })

  test('negative digits', () => {
    expect(call(ROUNDUP, [NUM(123), NUM(-2)])).toEqual(NUM(200))
  })

  test('error propagates', () => {
    expect(call(ROUNDUP, [ERR('#REF!'), NUM(0)])).toEqual(ERR('#REF!'))
  })

  test('coerces blank to 0', () => {
    expect(call(ROUNDUP, [NUM(2.1), BLANK])).toEqual(NUM(3))
  })
})

describe('ROUNDDOWN', () => {
  test('always toward zero (truncate)', () => {
    expect(call(ROUNDDOWN, [NUM(2.9), NUM(0)])).toEqual(NUM(2))
    expect(call(ROUNDDOWN, [NUM(-2.9), NUM(0)])).toEqual(NUM(-2))
  })

  test('positive digits', () => {
    expect(call(ROUNDDOWN, [NUM(3.14159), NUM(3)])).toEqual(NUM(3.141))
  })

  test('negative digits', () => {
    expect(call(ROUNDDOWN, [NUM(1999), NUM(-3)])).toEqual(NUM(1000))
  })

  test('error propagates', () => {
    expect(call(ROUNDDOWN, [NUM(1), ERR('#NUM!')])).toEqual(ERR('#NUM!'))
  })
})

// ---------------------------------------------------------------------------
// INT
// ---------------------------------------------------------------------------

describe('INT', () => {
  test('positive: drops fractional part', () => {
    expect(call(INT, [NUM(8.9)])).toEqual(NUM(8))
  })

  test('negative: rounds DOWN (not toward zero)', () => {
    // Excel INT(-8.9) = -9, not -8. This is the floor convention.
    expect(call(INT, [NUM(-8.9)])).toEqual(NUM(-9))
  })

  test('integer stays put', () => {
    expect(call(INT, [NUM(5)])).toEqual(NUM(5))
  })

  test('error propagates', () => {
    expect(call(INT, [ERR('#VALUE!')])).toEqual(ERR('#VALUE!'))
  })

  test('coerces string', () => {
    expect(call(INT, [STR('3.7')])).toEqual(NUM(3))
  })

  test('wrong arity → #VALUE!', () => {
    expect(call(INT, [])).toEqual(ERR('#VALUE!'))
    expect(call(INT, [NUM(1), NUM(2)])).toEqual(ERR('#VALUE!'))
  })
})

// ---------------------------------------------------------------------------
// MOD
// ---------------------------------------------------------------------------

describe('MOD', () => {
  test('happy path', () => {
    expect(call(MOD, [NUM(10), NUM(3)])).toEqual(NUM(1))
  })

  test('Excel sign convention: result follows divisor sign, not dividend', () => {
    // JS: -1 % 3 === -1. Excel: MOD(-1, 3) = 2.
    expect(call(MOD, [NUM(-1), NUM(3)])).toEqual(NUM(2))
    // JS: 1 % -3 === 1. Excel: MOD(1, -3) = -2.
    expect(call(MOD, [NUM(1), NUM(-3)])).toEqual(NUM(-2))
  })

  test('divisor zero → #DIV/0!', () => {
    expect(call(MOD, [NUM(5), NUM(0)])).toEqual(ERR('#DIV/0!'))
  })

  test('error propagates', () => {
    expect(call(MOD, [ERR('#REF!'), NUM(2)])).toEqual(ERR('#REF!'))
  })

  test('coerces string', () => {
    expect(call(MOD, [STR('10'), STR('3')])).toEqual(NUM(1))
  })

  test('wrong arity → #VALUE!', () => {
    expect(call(MOD, [NUM(1)])).toEqual(ERR('#VALUE!'))
  })
})

// ---------------------------------------------------------------------------
// ABS
// ---------------------------------------------------------------------------

describe('ABS', () => {
  test('positive stays positive', () => {
    expect(call(ABS, [NUM(5)])).toEqual(NUM(5))
  })

  test('negative becomes positive', () => {
    expect(call(ABS, [NUM(-5)])).toEqual(NUM(5))
  })

  test('zero stays zero', () => {
    expect(call(ABS, [NUM(0)])).toEqual(NUM(0))
  })

  test('coerces string', () => {
    expect(call(ABS, [STR('-3.14')])).toEqual(NUM(3.14))
  })

  test('error propagates', () => {
    expect(call(ABS, [ERR('#VALUE!')])).toEqual(ERR('#VALUE!'))
  })

  test('wrong arity → #VALUE!', () => {
    expect(call(ABS, [])).toEqual(ERR('#VALUE!'))
  })
})

// ---------------------------------------------------------------------------
// POWER
// ---------------------------------------------------------------------------

describe('POWER', () => {
  test('happy path', () => {
    expect(call(POWER, [NUM(2), NUM(10)])).toEqual(NUM(1024))
  })

  test('fractional exponent', () => {
    expect(call(POWER, [NUM(9), NUM(0.5)])).toEqual(NUM(3))
  })

  test('negative base with non-integer exponent → #NUM!', () => {
    expect(call(POWER, [NUM(-2), NUM(0.5)])).toEqual(ERR('#NUM!'))
  })

  test('0 ^ 0 → #NUM! (Excel diverges from JS Math.pow which returns 1)', () => {
    expect(call(POWER, [NUM(0), NUM(0)])).toEqual(ERR('#NUM!'))
  })

  test('0 ^ negative → #DIV/0!', () => {
    expect(call(POWER, [NUM(0), NUM(-1)])).toEqual(ERR('#DIV/0!'))
  })

  test('error propagates', () => {
    expect(call(POWER, [ERR('#REF!'), NUM(2)])).toEqual(ERR('#REF!'))
  })

  test('coerces string', () => {
    expect(call(POWER, [STR('2'), STR('3')])).toEqual(NUM(8))
  })
})

// ---------------------------------------------------------------------------
// SQRT
// ---------------------------------------------------------------------------

describe('SQRT', () => {
  test('happy path', () => {
    expect(call(SQRT, [NUM(16)])).toEqual(NUM(4))
  })

  test('zero', () => {
    expect(call(SQRT, [NUM(0)])).toEqual(NUM(0))
  })

  test('negative → #NUM!', () => {
    expect(call(SQRT, [NUM(-1)])).toEqual(ERR('#NUM!'))
  })

  test('coerces blank to 0', () => {
    expect(call(SQRT, [BLANK])).toEqual(NUM(0))
  })

  test('error propagates', () => {
    expect(call(SQRT, [ERR('#NUM!')])).toEqual(ERR('#NUM!'))
  })

  test('wrong arity → #VALUE!', () => {
    expect(call(SQRT, [NUM(1), NUM(2)])).toEqual(ERR('#VALUE!'))
  })
})

// ---------------------------------------------------------------------------
// SIGN
// ---------------------------------------------------------------------------

describe('SIGN', () => {
  test('positive → 1', () => {
    expect(call(SIGN, [NUM(42)])).toEqual(NUM(1))
  })

  test('negative → -1', () => {
    expect(call(SIGN, [NUM(-3.14)])).toEqual(NUM(-1))
  })

  test('zero → 0', () => {
    expect(call(SIGN, [NUM(0)])).toEqual(NUM(0))
  })

  test('coerces string', () => {
    expect(call(SIGN, [STR('-7')])).toEqual(NUM(-1))
  })

  test('error propagates', () => {
    expect(call(SIGN, [ERR('#DIV/0!')])).toEqual(ERR('#DIV/0!'))
  })

  test('wrong arity → #VALUE!', () => {
    expect(call(SIGN, [])).toEqual(ERR('#VALUE!'))
  })
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wave F / F1 — CEILING / FLOOR / TRUNC / SUMPRODUCT / PRODUCT
// ---------------------------------------------------------------------------

describe('CEILING', () => {
  test('round up to nearest multiple of significance', () => {
    expect(call(CEILING, [NUM(2.5), NUM(1)])).toEqual(NUM(3))
    expect(call(CEILING, [NUM(2.3), NUM(0.5)])).toEqual(NUM(2.5))
    expect(call(CEILING, [NUM(7), NUM(3)])).toEqual(NUM(9))
  })

  test('default significance = 1', () => {
    expect(call(CEILING, [NUM(2.5)])).toEqual(NUM(3))
  })

  test('significance = 0 → 0 (Excel CEILING.MATH)', () => {
    expect(call(CEILING, [NUM(5), NUM(0)])).toEqual(NUM(0))
  })

  test('error propagation', () => {
    expect(call(CEILING, [ERR('#DIV/0!'), NUM(1)])).toEqual(ERR('#DIV/0!'))
  })
})

describe('FLOOR', () => {
  test('round down to nearest multiple of significance', () => {
    expect(call(FLOOR, [NUM(2.5), NUM(1)])).toEqual(NUM(2))
    expect(call(FLOOR, [NUM(2.7), NUM(0.5)])).toEqual(NUM(2.5))
    expect(call(FLOOR, [NUM(7), NUM(3)])).toEqual(NUM(6))
  })

  test('default significance = 1', () => {
    expect(call(FLOOR, [NUM(2.9)])).toEqual(NUM(2))
  })

  test('negative value floors toward negative infinity', () => {
    expect(call(FLOOR, [NUM(-2.5), NUM(1)])).toEqual(NUM(-3))
  })

  test('significance = 0 → 0', () => {
    expect(call(FLOOR, [NUM(5), NUM(0)])).toEqual(NUM(0))
  })
})

describe('TRUNC', () => {
  test('default digits=0, truncate toward zero', () => {
    expect(call(TRUNC, [NUM(3.7)])).toEqual(NUM(3))
    expect(call(TRUNC, [NUM(-3.7)])).toEqual(NUM(-3))
  })

  test('digits>0 preserves decimal places', () => {
    expect(call(TRUNC, [NUM(3.14159), NUM(2)])).toEqual(NUM(3.14))
  })

  test('digits<0 zeroes out left of decimal', () => {
    expect(call(TRUNC, [NUM(123.45), NUM(-1)])).toEqual(NUM(120))
  })

  test('error propagation', () => {
    expect(call(TRUNC, [ERR('#NUM!')])).toEqual(ERR('#NUM!'))
  })
})

describe('SUMPRODUCT', () => {
  test('element-wise product summed for equal-shape arrays', () => {
    expect(
      call(SUMPRODUCT, [
        ARR([[NUM(1), NUM(2), NUM(3)]]),
        ARR([[NUM(4), NUM(5), NUM(6)]]),
      ]),
    ).toEqual(NUM(1 * 4 + 2 * 5 + 3 * 6))
  })

  test('shape mismatch → #VALUE!', () => {
    expect(
      call(SUMPRODUCT, [ARR([[NUM(1), NUM(2)]]), ARR([[NUM(1), NUM(2), NUM(3)]])]),
    ).toEqual(ERR('#VALUE!'))
  })

  test('non-numeric inside array treated as 0 (Excel quirk)', () => {
    expect(
      call(SUMPRODUCT, [
        ARR([[NUM(1), STR('hello'), NUM(3)]]),
        ARR([[NUM(4), NUM(5), NUM(6)]]),
      ]),
    ).toEqual(NUM(1 * 4 + 0 + 3 * 6))
  })

  test('error inside array propagates', () => {
    expect(
      call(SUMPRODUCT, [
        ARR([[NUM(1), NUM(2), NUM(3)]]),
        ARR([[NUM(4), ERR('#REF!'), NUM(6)]]),
      ]),
    ).toEqual(ERR('#REF!'))
  })

  test('single-array variant returns straight sum', () => {
    expect(call(SUMPRODUCT, [ARR([[NUM(1), NUM(2), NUM(3)]])])).toEqual(NUM(6))
  })

  test('zero args → #VALUE!', () => {
    expect(call(SUMPRODUCT, [])).toEqual(ERR('#VALUE!'))
  })

  // Kahan compensated summation regression — FUNCTION_QUALITY_2026-06-05.md
  // "Numerical stability" entry. Naive sum loses small terms when paired
  // with a large term; Kahan keeps them.
  test('compensated sum recovers small terms in 1e20 + 1 - 1e20 pattern', () => {
    // Single-array SUMPRODUCT collapses to a straight Kahan sum of the row.
    const row: Value[] = []
    for (let i = 0; i < 100; i += 1) {
      row.push(NUM(1e20))
      row.push(NUM(1))
      row.push(NUM(-1e20))
    }
    // Naive sum yields 0 (each +1 vanishes against 1e20). Kahan yields 100.
    expect(call(SUMPRODUCT, [ARR([row])])).toEqual(NUM(100))
  })

  test('two-array SUMPRODUCT with disparate magnitudes keeps the small terms', () => {
    // First array: alternating 1e20 / 1 / -1e20. Second: all ones.
    // Product is identical to first; sum should be 1 per (1e20, 1, -1e20)
    // triple, totalling 50 across 50 such triples (150 cells).
    const a: Value[] = []
    const b: Value[] = []
    for (let i = 0; i < 50; i += 1) {
      a.push(NUM(1e20))
      a.push(NUM(1))
      a.push(NUM(-1e20))
      b.push(NUM(1))
      b.push(NUM(1))
      b.push(NUM(1))
    }
    expect(call(SUMPRODUCT, [ARR([a]), ARR([b])])).toEqual(NUM(50))
  })

  test('long uniform-magnitude sum stays within 1 ULP of the naive result', () => {
    // 10k 0.1s — naive sum drifts noticeably from 1000 (≈ 1000.0000000001587);
    // Kahan stays within a tighter envelope. We assert the magnitude is
    // correct and the error is at most a handful of ULPs.
    const row: Value[] = []
    for (let i = 0; i < 10000; i += 1) row.push(NUM(0.1))
    const out = call(SUMPRODUCT, [ARR([row])])
    expect(out.kind).toBe('number')
    if (out.kind === 'number') {
      // Kahan summation of 10000 × 0.1 yields exactly 1000 in IEEE 754
      // double (the compensation cancels all the 2^-52 drift). Naive sum
      // would yield 1000.0000000001587. We pin the exact Kahan result.
      expect(out.value).toBe(1000)
    }
  })
})

describe('PRODUCT', () => {
  test('happy path: multiply all numeric scalar args', () => {
    expect(call(PRODUCT, [NUM(2), NUM(3), NUM(4)])).toEqual(NUM(24))
  })

  test('ignores non-numeric inside arrays', () => {
    expect(
      call(PRODUCT, [ARR([[NUM(2), STR('hi'), BOOL(true)], [BLANK, NUM(3)]])]),
    ).toEqual(NUM(6))
  })

  test('empty product → 0 (Excel quirk, not 1)', () => {
    expect(call(PRODUCT, [])).toEqual(NUM(0))
  })

  test('error propagation', () => {
    expect(call(PRODUCT, [NUM(2), ERR('#DIV/0!')])).toEqual(ERR('#DIV/0!'))
  })
})

describe('FUNCTIONS registry', () => {
  test('exposes a baseline set of math functions (extensible as new ones land)', () => {
    const keys = new Set(Object.keys(FUNCTIONS))
    // Spot-check the v1 + F1 baseline is intact. New phase-8 additions
    // expand the registry over time; this test guards against regressions
    // (removing baseline names) without rewriting on every addition.
    const baseline = [
      'ABS', 'AVERAGE', 'CEILING', 'COUNT', 'COUNTA', 'FLOOR', 'INT',
      'MAX', 'MIN', 'MOD', 'POWER', 'PRODUCT', 'ROUND', 'ROUNDDOWN',
      'ROUNDUP', 'SIGN', 'SQRT', 'SUM', 'SUMPRODUCT', 'TRUNC',
    ]
    for (const name of baseline) {
      expect(keys.has(name)).toBe(true)
    }
  })

  test('every entry satisfies FunctionImpl shape', () => {
    // Zero-arity functions (PI, RAND) intentionally reject any args
    // including a leading error — they fail the arity gate before
    // looking at args. Exclude from the propagation spot check.
    const zeroArityOnly = new Set(['PI', 'RAND'])
    // The COUNT family is the documented exception to "errors propagate":
    // an error is simply not a number (COUNT), not blank (COUNTA,
    // COUNTBLANK), so it is skipped/counted rather than answered. MS docs,
    // COUNT § Remarks: "Arguments that are error values or text that cannot
    // be translated into numbers are not counted." The Rust engine agrees —
    // its `"COUNT"` / `"COUNTA"` / `"COUNTBLANK"` arms have no short-circuit
    // at all. This set is the ONLY licence to not propagate; adding a name
    // to it is a semantic claim that needs the same kind of evidence.
    const countsInsteadOfPropagating = new Set(['COUNT', 'COUNTA', 'COUNTBLANK'])
    for (const [name, fn] of Object.entries(FUNCTIONS)) {
      expect(typeof fn).toBe('function')
      // Spot check: every fn should accept an empty args array without
      // throwing — it may return an error Value, but never throw.
      expect(() => fn([], ctx)).not.toThrow()
      if (countsInsteadOfPropagating.has(name)) {
        // Pin the exception rather than merely skipping it: a leading
        // scalar error must produce a NUMBER, and specifically must not
        // quietly become an error again.
        const result = fn([{ kind: 'error', code: '#REF!' }], ctx)
        expect(result.kind).toBe('number')
      } else if (!zeroArityOnly.has(name)) {
        // Every other fn propagates a leading scalar error.
        const result = fn([{ kind: 'error', code: '#REF!' }], ctx)
        expect(result.kind === 'error' && result.code).toBe('#REF!')
      }
      expect(name).toBe(name.toUpperCase())
    }
  })
})

// Fermat P2 — whole-column multi-area aggregation must route each sub-area
// through the same sparse path that single-area whole-column SUM/COUNTIF/SUMIF
// use. Without this, `SUM((A:A,C:C))` falls into the materializing path and
// trips the per-range materialization cap (or returns 0 for criterion-based).
//
// This needs the evaluator (not bare FunctionImpls in `FUNCTIONS`) because the
// sparse path lives in `evaluate.ts` next to the sheet snapshot.
describe('whole-column multi-area sparse aggregation', () => {
  function makeWorkbook(): Workbook {
    const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
    // Sparse data in A and C; everything else blank — the whole-column path
    // would materialize 2,097,152 cells without the multi-area sparse routing.
    wb.setCell('s1', 0, 0, '1')
    wb.setCell('s1', 5, 0, '5')
    wb.setCell('s1', 0, 2, '10')
    wb.setCell('s1', 5, 2, '50')
    return wb
  }

  function readCell(wb: Workbook, sheetId: string, row: number, col: number): Value {
    const sheet = wb.sheet(sheetId)
    if (!sheet) throw new Error(`missing sheet ${sheetId}`)
    return wb.store.getter(sheet.formulaCellAtom(keyFor(row, col)))
  }

  test('SUM((A:A,C:C)) sums each whole column via sparse iteration', () => {
    const wb = makeWorkbook()
    wb.setCell('s1', 0, 5, '=SUM((A:A,C:C))')
    expect(readCell(wb, 's1', 0, 5)).toEqual({ kind: 'number', value: 66 })
  })

  test('SUMIF((A:A,C:C), ">0") routes each area through SUMIF sparse path', () => {
    const wb = makeWorkbook()
    wb.setCell('s1', 0, 5, '=SUMIF((A:A,C:C), ">0")')
    expect(readCell(wb, 's1', 0, 5)).toEqual({ kind: 'number', value: 66 })
  })

  test('COUNTIF((A:A,C:C), ">0") counts via sparse iteration', () => {
    const wb = makeWorkbook()
    wb.setCell('s1', 0, 5, '=COUNTIF((A:A,C:C), ">0")')
    expect(readCell(wb, 's1', 0, 5)).toEqual({ kind: 'number', value: 4 })
  })

  test('COUNTA((A:A,C:C)) and COUNT((A:A,C:C)) count populated numeric cells', () => {
    const wb = makeWorkbook()
    wb.setCell('s1', 0, 5, '=COUNTA((A:A,C:C))')
    wb.setCell('s1', 1, 5, '=COUNT((A:A,C:C))')
    expect(readCell(wb, 's1', 0, 5)).toEqual({ kind: 'number', value: 4 })
    expect(readCell(wb, 's1', 1, 5)).toEqual({ kind: 'number', value: 4 })
  })
})
