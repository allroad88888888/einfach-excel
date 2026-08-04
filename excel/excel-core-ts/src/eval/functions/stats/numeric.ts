import type { Value } from '../../../types'
import type { EvalContext } from '../../../types'
import { toBoolean, toNumber } from '../../coerce'
import { flatten } from './values'

// ---------------------------------------------------------------------------
// Phase 8 additions — descriptive stats
// ---------------------------------------------------------------------------

export const NUM = (n: number): Value => ({ kind: 'number', value: n })
export const ERR_VAL = (
  code: '#DIV/0!' | '#N/A' | '#NUM!' | '#VALUE!',
  message?: string,
): Value => (message ? { kind: 'error', code, message } : { kind: 'error', code })

export type NumberArg = { ok: true; value: number } | { ok: false; err: Value }
export type BooleanArg = { ok: true; value: boolean } | { ok: false; err: Value }

export function numberArg(value: Value): NumberArg {
  const n = toNumber(value)
  if (!n.ok) return { ok: false, err: n.error }
  if (!Number.isFinite(n.value)) return { ok: false, err: ERR_VAL('#NUM!') }
  return { ok: true, value: n.value }
}

export function booleanArg(value: Value): BooleanArg {
  const b = toBoolean(value)
  if (!b.ok) return { ok: false, err: b.error }
  return { ok: true, value: b.value }
}

/**
 * Walk every numeric value in args (Excel range-arg semantics: arrays
 * ignore non-numeric; scalars coerce). Returns numbers as a flat array,
 * or the first error encountered.
 */
export function collectNumbers(
  args: ReadonlyArray<Value>,
): { ok: true; values: number[] } | { ok: false; err: Value } {
  const out: number[] = []
  for (const arg of args) {
    if (arg.kind === 'error') return { ok: false, err: arg }
    if (arg.kind === 'array') {
      for (const row of arg.value) {
        for (const cell of row) {
          if (cell.kind === 'error') return { ok: false, err: cell }
          if (cell.kind === 'number') out.push(cell.value)
          // string / boolean / blank inside array → skipped
        }
      }
      continue
    }
    const n = toNumber(arg)
    if (!n.ok) return { ok: false, err: n.error }
    out.push(n.value)
  }
  return { ok: true, values: out }
}

export function collectNumbersA(
  args: ReadonlyArray<Value>,
): { ok: true; values: number[] } | { ok: false; err: Value } {
  const out: number[] = []
  const push = (value: Value): Value | undefined => {
    if (value.kind === 'error') return value
    if (value.kind === 'number') out.push(value.value)
    else if (value.kind === 'boolean') out.push(value.value ? 1 : 0)
    else if (value.kind === 'string') out.push(0)
    else if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) {
          const err = push(cell)
          if (err) return err
        }
      }
    }
    return undefined
  }
  for (const arg of args) {
    const err = push(arg)
    if (err) return { ok: false, err }
  }
  return { ok: true, values: out }
}

export interface NumberPair {
  readonly x: number
  readonly y: number
}

export function collectNumberPairs(
  a: Value,
  b: Value,
): { ok: true; pairs: NumberPair[] } | { ok: false; err: Value } {
  if (a.kind === 'error') return { ok: false, err: a }
  if (b.kind === 'error') return { ok: false, err: b }
  const left = flatten(a)
  const right = flatten(b)
  if (left.length !== right.length) return { ok: false, err: ERR_VAL('#N/A') }

  const pairs: NumberPair[] = []
  for (let i = 0; i < left.length; i++) {
    const x = left[i]
    const y = right[i]
    if (x.kind === 'error') return { ok: false, err: x }
    if (y.kind === 'error') return { ok: false, err: y }
    if (x.kind === 'number' && y.kind === 'number') pairs.push({ x: x.value, y: y.value })
  }
  return { ok: true, pairs }
}

export function meanOf(values: ReadonlyArray<number>): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function sumSquaredDeviations(values: ReadonlyArray<number>, mean: number): number {
  return values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0)
}

/**
 * Welford's single-pass online algorithm for the sum of squared deviations (M2).
 * Numerically stable for large-mean / tiny-spread inputs where the two-pass
 * formula loses precision to catastrophic cancellation.
 *
 * Returns { n, mean, M2 } so callers pick sample (M2/(n-1)) vs population (M2/n).
 */
export function welfordM2(values: ReadonlyArray<number>): { n: number; mean: number; M2: number } {
  let n = 0
  let mean = 0
  let M2 = 0
  for (const x of values) {
    n += 1
    const delta = x - mean
    mean += delta / n
    const delta2 = x - mean
    M2 += delta * delta2
  }
  return { n, mean, M2 }
}

export function finiteNumber(value: number): Value {
  return Number.isFinite(value) ? NUM(value) : ERR_VAL('#NUM!')
}

/** Sentinel used by wrapper formulas whose implementations never read context. */
export const ctxStub = new Proxy({}, {
  get(_, prop) {
    throw new Error('stats fn unexpectedly read ctx.' + String(prop))
  },
}) as unknown as EvalContext
