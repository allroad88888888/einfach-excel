import type { Value } from '../../../types'
import { toNumber } from '../../coerce'

export const NUM = (value: number): Value => ({ kind: 'number', value })
export const ERR = (code: '#DIV/0!' | '#NUM!' | '#VALUE!', message?: string): Value =>
  message === undefined ? { kind: 'error', code } : { kind: 'error', code, message }

export const NR_MAX_ITERS = 50
export const NR_TOLERANCE = 1e-7
export const RATE_RESIDUAL_REL_TOLERANCE = NR_TOLERANCE
export const RATE_ZERO_RESIDUAL_REL_TOLERANCE = Number.EPSILON * 1024
export const CASHFLOW_RESIDUAL_REL_TOLERANCE = 1e-10
export const XIRR_MAX_ITERS = 100
export const BOND_MAX_ITERS = 100

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

type Parsed = { ok: true; n: number } | { ok: false; err: Value }

export function parseArg(v: Value): Parsed {
  const r = toNumber(v)
  if (!r.ok) return { ok: false, err: r.error }
  return { ok: true, n: r.value }
}

export function parseTypeArg(v: Value): Parsed {
  const parsed = parseArg(v)
  if (!parsed.ok) return parsed
  const type = Math.trunc(parsed.n)
  return type === 0 || type === 1 ? { ok: true, n: type } : { ok: false, err: ERR('#VALUE!') }
}

export function annuityCompound(rate: number, nper: number): number {
  if (rate === 0) return nper
  return (Math.pow(1 + rate, nper) - 1) / rate
}

export function residualConverged(
  residual: number,
  scale: number,
  tolerance = CASHFLOW_RESIDUAL_REL_TOLERANCE,
): boolean {
  if (!Number.isFinite(residual) || !Number.isFinite(scale)) return false
  // Harvey P2 — floor the scale at 1 so tiny-cashflow inputs (where the
  // natural |scale| ≪ 1) don't get a sub-machine-epsilon tolerance threshold.
  // Without the floor, RATE/IRR/XIRR can accept a stuck-Newton step whose
  // residual is still significant relative to the cashflow scale. With the
  // floor, the threshold is `max(|scale|, 1) * tolerance` — Excel's behavior.
  const effectiveScale = Math.max(Math.abs(scale), 1)
  return Math.abs(residual) <= effectiveScale * tolerance
}

export function rateResidualConverged(residual: number, scale: number): boolean {
  if (!Number.isFinite(residual) || !Number.isFinite(scale)) return false
  const absScale = Math.abs(scale)
  const relativeTolerance = absScale * RATE_RESIDUAL_REL_TOLERANCE
  const numericTolerance = Math.max(absScale, 1) * RATE_ZERO_RESIDUAL_REL_TOLERANCE
  return Math.abs(residual) <= Math.max(relativeTolerance, numericTolerance)
}

// ---------------------------------------------------------------------------
// Core PV / FV / PMT identity helpers
// ---------------------------------------------------------------------------

/**
 * Standard annuity formula. Used by FV, PV, PMT, IPMT, PPMT.
 *
 *   pv * (1+r)^n + pmt * (1 + r*type) * ((1+r)^n - 1) / r + fv = 0
 *
 * `compute` solves for whichever variable is left as `undefined`.
 */
export function presentValue(rate: number, nper: number, pmt: number, fv: number, type: number): number {
  if (rate === 0) {
    return -(fv + pmt * nper)
  }
  const pow = Math.pow(1 + rate, nper)
  return -(fv + pmt * (1 + rate * type) * (pow - 1) / rate) / pow
}

export function futureValue(rate: number, nper: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) {
    return -(pv + pmt * nper)
  }
  const pow = Math.pow(1 + rate, nper)
  return -(pv * pow + pmt * (1 + rate * type) * (pow - 1) / rate)
}

export function periodicPayment(rate: number, nper: number, pv: number, fv: number, type: number): number {
  if (rate === 0) {
    return -(pv + fv) / nper
  }
  const pow = Math.pow(1 + rate, nper)
  return -(pv * pow + fv) / ((1 + rate * type) * ((pow - 1) / rate))
}

export function numberOfPeriods(rate: number, pmt: number, pv: number, fv: number, type: number): number {
  if (rate === 0) {
    return -(pv + fv) / pmt
  }
  // Solving (1+r)^n in pv * (1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r + fv = 0:
  //   Let X = (1+r)^n, A = pmt*(1+r*type)/r.
  //   pv*X + A*(X - 1) + fv = 0
  //   X*(pv + A) = A - fv
  //   X = (A - fv) / (pv + A)
  const a = pmt * (1 + rate * type) / rate
  const numerator = a - fv
  const denominator = pv + a
  if (denominator === 0) return NaN
  const x = numerator / denominator
  if (x <= 0) return NaN
  return Math.log(x) / Math.log(1 + rate)
}
