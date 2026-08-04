/** Integer aggregation, blank counting, and polynomial series functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'
import { forEachNumericArg } from './aggregation'

export const GCD: FunctionImpl = (args) => {
  if (args.length === 0) return ERR('#VALUE!')
  const propagated = propagateError(args)
  if (propagated) return propagated
  const nums: number[] = []
  let hasNegative = false
  const walk = forEachNumericArg(args, (n) => {
    if (n < 0) hasNegative = true
    nums.push(Math.trunc(Math.abs(n)))
  })
  if (!walk.ok) return walk.error
  if (hasNegative) return ERR('#NUM!')
  if (nums.length === 0) return NUM(0)
  const gcd2 = (a: number, b: number): number => {
    while (b !== 0) {
      [a, b] = [b, a % b]
    }
    return a
  }
  let g = nums[0]
  for (let i = 1; i < nums.length; i++) g = gcd2(g, nums[i])
  return NUM(g)
}

/** LCM(a, b, ...) — least common multiple. */
export const LCM: FunctionImpl = (args) => {
  if (args.length === 0) return ERR('#VALUE!')
  const propagated = propagateError(args)
  if (propagated) return propagated
  const nums: number[] = []
  let hasNegative = false
  const walk = forEachNumericArg(args, (n) => {
    if (n < 0) hasNegative = true
    nums.push(Math.trunc(Math.abs(n)))
  })
  if (!walk.ok) return walk.error
  if (hasNegative) return ERR('#NUM!')
  if (nums.length === 0) return NUM(0)
  if (nums.some((n) => n === 0)) return NUM(0)
  const gcd2 = (a: number, b: number): number => {
    while (b !== 0) {
      [a, b] = [b, a % b]
    }
    return a
  }
  let l = nums[0]
  for (let i = 1; i < nums.length; i++) {
    l = (l / gcd2(l, nums[i])) * nums[i]
    if (!Number.isFinite(l)) return ERR('#NUM!')
  }
  return NUM(l)
}

/**
 * COUNTBLANK(range) — count blank cells in a range.
 *
 * An error is not blank, so it contributes 0 and is NOT propagated — same
 * rule as COUNT / COUNTA, same as Rust's `"COUNTBLANK"` arm
 * (`if matches!(v, Value::Null)`).
 */
export const COUNTBLANK: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR('#VALUE!')
  const arg = args[0]
  let count = 0
  if (arg.kind === 'array') {
    for (const row of arg.value) {
      for (const cell of row) {
        if (cell.kind === 'blank') count++
        // Excel also counts empty strings as blank for COUNTBLANK.
        else if (cell.kind === 'string' && cell.value === '') count++
      }
    }
  } else {
    if (arg.kind === 'blank') count = 1
    else if (arg.kind === 'string' && arg.value === '') count = 1
  }
  return NUM(count)
}

/** SUMSQ(...args) — sum of squares. */
export const SUMSQ: FunctionImpl = (args) => {
  let total = 0
  const walk = forEachNumericArg(args, (n) => {
    total += n * n
  })
  if (!walk.ok) return walk.error
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}

function collectSeriesCoefficients(value: Value, out: number[]): Value & { kind: 'error' } | undefined {
  if (value.kind === 'array') {
    for (const row of value.value) {
      for (const cell of row) {
        const err = collectSeriesCoefficients(cell, out)
        if (err) return err
      }
    }
    return undefined
  }
  if (value.kind === 'error') return value
  const n = toNumber(value)
  if (!n.ok) return n.error
  out.push(n.value)
  return undefined
}

/** SERIESSUM(x, n, m, coefficients) — sum c_i * x^(n + i*m). */
export const SERIESSUM: FunctionImpl = (args) => {
  const propagated = propagateError(args.slice(0, 3))
  if (propagated) return propagated
  if (args.length !== 4) return ERR('#VALUE!')
  const x = toNumber(args[0])
  if (!x.ok) return x.error
  const n = toNumber(args[1])
  if (!n.ok) return n.error
  const m = toNumber(args[2])
  if (!m.ok) return m.error
  const coefficients: number[] = []
  const coefficientError = collectSeriesCoefficients(args[3], coefficients)
  if (coefficientError) return coefficientError
  if (coefficients.length === 0) return ERR('#VALUE!')
  // Kahan-Babuška-Neumaier compensated summation — same rationale as
  // SUMPRODUCT. Recovers the small tail of a Taylor expansion when the
  // leading term dwarfs it, and also handles the 1e20+1-1e20-style
  // catastrophic-cancellation pattern that plain Kahan misses.
  let total = 0
  let c = 0 // running compensation
  for (let i = 0; i < coefficients.length; i += 1) {
    const term = coefficients[i] * Math.pow(x.value, n.value + i * m.value)
    if (!Number.isFinite(term) || Number.isNaN(term)) return ERR('#NUM!')
    const t = total + term
    if (Math.abs(total) >= Math.abs(term)) {
      c += total - t + term
    } else {
      c += term - t + total
    }
    total = t
  }
  total += c
  if (!Number.isFinite(total) || Number.isNaN(total)) return ERR('#NUM!')
  return NUM(total)
}

export const FUNCTIONS: Record<string, FunctionImpl> = { GCD, LCM, COUNTBLANK, SUMSQ, SERIESSUM }
