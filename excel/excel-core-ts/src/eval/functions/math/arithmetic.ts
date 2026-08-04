/** Multiple-based rounding and product arithmetic. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { finiteOrNum } from '../../overflow'
import { ERR, NUM } from './shared'
import { forEachNumericArg } from './aggregation'
import { truncTowardZero } from './rounding'

export const CEILING: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  let sig = 1
  if (args.length === 2) {
    const s = toNumber(args[1])
    if (!s.ok) return s.error
    sig = s.value
  }
  if (sig === 0) return NUM(0)
  const absSig = Math.abs(sig)
  const out = Math.ceil(v.value / absSig) * absSig
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

/**
 * FLOOR(value, [significance=1]) — round DOWN (toward negative
 * infinity) to the nearest multiple of `significance`.
 *
 * Excel's classic FLOOR signals #NUM! when `value > 0` and
 * `significance < 0` (or vice-versa). FLOOR.MATH relaxes that.
 * We follow FLOOR.MATH's relaxed behavior (matches the CEILING side
 * of this pair).
 */
export const FLOOR: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  let sig = 1
  if (args.length === 2) {
    const s = toNumber(args[1])
    if (!s.ok) return s.error
    sig = s.value
  }
  if (sig === 0) return NUM(0)
  const absSig = Math.abs(sig)
  const out = Math.floor(v.value / absSig) * absSig
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

/**
 * TRUNC(value, [digits=0]) — truncate toward zero, preserving the first
 * `digits` decimal places. Same shape as ROUNDDOWN but locked at 1-2
 * args (Excel uses identical semantics here; the two functions exist
 * for historical reasons).
 */
export const TRUNC: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  let digits = 0
  if (args.length === 2) {
    const d = toNumber(args[1])
    if (!d.ok) return d.error
    digits = Math.trunc(d.value)
  }
  return NUM(truncTowardZero(v.value, digits))
}

/**
 * SUMPRODUCT(array1, [array2], ...) — element-wise product summed.
 *
 *   SUMPRODUCT([1,2,3], [4,5,6]) = 1*4 + 2*5 + 3*6 = 32
 *
 * Excel rules:
 *  - All arrays must have the same shape (rows × cols). Mismatch → `#VALUE!`.
 *  - Non-numeric cells inside arrays are treated as 0 (NOT propagated as
 *    `#VALUE!` like a normal multiply would be). This is Excel's documented
 *    quirk — text in a SUMPRODUCT range zeroes the row, doesn't poison it.
 *  - Errors anywhere still propagate.
 *  - Scalar (non-array) args are 1×1 inputs. They can pair with other
 *    1×1 inputs, but never broadcast across a multi-cell range.
 */
export const SUMPRODUCT: FunctionImpl = (args) => {
  if (args.length === 0) return ERR('#VALUE!')
  const propagated = propagateError(args)
  if (propagated) return propagated

  // Normalize every arg to a 2-D Value[][] grid. Scalars become 1×1.
  const grids: Value[][][] = []
  for (const arg of args) {
    if (arg.kind === 'array') {
      grids.push(arg.value as Value[][])
    } else {
      grids.push([[arg]])
    }
  }

  // SUMPRODUCT requires an exact common shape. In particular, an omitted
  // trailing slot evaluates to a 1×1 blank and must not broadcast across a
  // range: `=SUMPRODUCT(F1:F5,)` is `#VALUE!` in Excel.
  const rows = grids[0].length
  const cols = grids[0][0]?.length ?? 0
  if (rows === 0 || cols === 0) return ERR('#VALUE!')

  // All grids must be exactly (rows × cols). Anything else → #VALUE!.
  for (const g of grids) {
    const gr = g.length
    const gc = g[0]?.length ?? 0
    if (gr !== rows || gc !== cols) return ERR('#VALUE!')
  }

  // Kahan-Babuška-Neumaier compensated summation. Plain Kahan loses
  // precision when a small accumulated compensation gets absorbed by a
  // following large summand (classic textbook example: 1e20 + 1 - 1e20
  // → plain Kahan still returns 0). The Neumaier variant tracks the
  // larger of (running sum, incoming term) per step and accumulates the
  // round-off into a compensation that is added once at the end. Long
  // ranges of similar-magnitude products gain a few ULPs of precision;
  // catastrophic-cancellation patterns recover the small terms entirely.
  let total = 0
  let c = 0 // running compensation
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      let product = 1
      for (const g of grids) {
        const cell = g[r][cIdx]
        if (cell.kind === 'error') return cell
        if (cell.kind === 'number') {
          product *= cell.value
        } else {
          // Non-numeric → treated as 0 (Excel SUMPRODUCT quirk).
          product = 0
          break
        }
      }
      const t = total + product
      if (Math.abs(total) >= Math.abs(product)) {
        c += total - t + product
      } else {
        c += product - t + total
      }
      total = t
    }
  }
  total += c
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}

/**
 * PRODUCT(...args) — multiply all numeric args together. Same
 * scalar-coerce / array-ignore split as SUM. Empty product → 0
 * (Excel's documented behavior — divergence from math but a long-
 * standing quirk).
 */
export const PRODUCT: FunctionImpl = (args) => {
  let total = 1
  let seen = false
  const walk = forEachNumericArg(args, (n) => {
    total *= n
    seen = true
  })
  if (!walk.ok) return walk.error
  if (!seen) return NUM(0)
  // 连乘比连加更容易顶破 f64 —— 同一条出口闸门。
  return finiteOrNum(total)
}


export const FUNCTIONS: Record<string, FunctionImpl> = { CEILING, FLOOR, TRUNC, SUMPRODUCT, PRODUCT }
