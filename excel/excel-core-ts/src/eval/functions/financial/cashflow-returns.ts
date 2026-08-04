import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { NUM, ERR, NR_MAX_ITERS, NR_TOLERANCE, parseArg, residualConverged } from './shared'

export type Cashflow = { ok: true; values: number[] } | { ok: false; err: Value }

export function collectCashflows(args: ReadonlyArray<Value>): Cashflow {
  const out: number[] = []
  for (const arg of args) {
    if (arg.kind === 'error') return { ok: false, err: arg }
    if (arg.kind === 'array') {
      for (const row of arg.value) {
        for (const cell of row) {
          if (cell.kind === 'error') return { ok: false, err: cell }
          if (cell.kind === 'number') out.push(cell.value)
          // string / boolean / blank inside an array → silently skipped
        }
      }
      continue
    }
    // Scalar arg — coerce.
    const n = toNumber(arg)
    if (!n.ok) return { ok: false, err: n.error }
    out.push(n.value)
  }
  return { ok: true, values: out }
}

export const NPV: FunctionImpl = (args) => {
  if (args.length < 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const flows = collectCashflows(args.slice(1))
  if (!flows.ok) return flows.err
  if (rate.n <= -1) return ERR('#NUM!')
  let sum = 0
  // Excel's NPV starts discounting from period 1, not 0.
  for (let i = 0; i < flows.values.length; i++) {
    sum += flows.values[i] / Math.pow(1 + rate.n, i + 1)
  }
  if (!Number.isFinite(sum)) return ERR('#NUM!')
  return NUM(sum)
}

// ---------------------------------------------------------------------------
// IRR — Newton-Raphson on cash-flow series
// ---------------------------------------------------------------------------

/**
 * NPV at rate `r` over `flows` (starting at period 0).
 * Note this differs from NPV() — IRR's NPV starts at period 0, not 1.
 */
export function irrNPV(rate: number, flows: ReadonlyArray<number>): number {
  let sum = 0
  for (let i = 0; i < flows.length; i++) {
    sum += flows[i] / Math.pow(1 + rate, i)
  }
  return sum
}

export function irrNPVScale(rate: number, flows: ReadonlyArray<number>): number {
  let sum = 0
  for (let i = 0; i < flows.length; i++) {
    sum += Math.abs(flows[i] / Math.pow(1 + rate, i))
  }
  return sum
}

export function irrDerivative(rate: number, flows: ReadonlyArray<number>): number {
  let sum = 0
  for (let i = 1; i < flows.length; i++) {
    sum -= (i * flows[i]) / Math.pow(1 + rate, i + 1)
  }
  return sum
}

export const IRR: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const flows = collectCashflows([args[0]])
  if (!flows.ok) return flows.err
  if (flows.values.length < 2) return ERR('#NUM!')

  // IRR needs at least one positive and one negative cash flow.
  let hasPos = false
  let hasNeg = false
  for (const v of flows.values) {
    if (v > 0) hasPos = true
    if (v < 0) hasNeg = true
  }
  if (!hasPos || !hasNeg) return ERR('#NUM!')

  let guess = 0.1
  if (args.length === 2) {
    const g = parseArg(args[1])
    if (!g.ok) return g.err
    guess = g.n
  }

  let rate = guess
  for (let i = 0; i < NR_MAX_ITERS; i++) {
    const f = irrNPV(rate, flows.values)
    if (residualConverged(f, irrNPVScale(rate, flows.values))) return NUM(rate)
    const fprime = irrDerivative(rate, flows.values)
    if (fprime === 0 || !Number.isFinite(fprime)) return ERR('#NUM!')
    const step = f / fprime
    const next = rate - step
    if (!Number.isFinite(next)) return ERR('#NUM!')
    if (Math.abs(step) < NR_TOLERANCE) {
      const nextResidual = irrNPV(next, flows.values)
      return residualConverged(nextResidual, irrNPVScale(next, flows.values))
        ? NUM(next)
        : ERR('#NUM!')
    }
    rate = next
  }
  const final = irrNPV(rate, flows.values)
  if (residualConverged(final, irrNPVScale(rate, flows.values))) return NUM(rate)
  return ERR('#NUM!')
}
