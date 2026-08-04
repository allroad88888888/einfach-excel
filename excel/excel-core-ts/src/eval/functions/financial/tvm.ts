import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, NR_MAX_ITERS, NR_TOLERANCE, parseArg, parseTypeArg, rateResidualConverged, presentValue, futureValue, periodicPayment, numberOfPeriods } from './shared'

export const PV: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const nper = parseArg(args[1])
  if (!nper.ok) return nper.err
  const pmt = parseArg(args[2])
  if (!pmt.ok) return pmt.err
  let fv = 0
  if (args.length >= 4) {
    const r = parseArg(args[3])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length === 5) {
    const r = parseTypeArg(args[4])
    if (!r.ok) return r.err
    type = r.n
  }
  const result = presentValue(rate.n, nper.n, pmt.n, fv, type)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

// ---------------------------------------------------------------------------
// FV
// ---------------------------------------------------------------------------

export const FV: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const nper = parseArg(args[1])
  if (!nper.ok) return nper.err
  const pmt = parseArg(args[2])
  if (!pmt.ok) return pmt.err
  let pv = 0
  if (args.length >= 4) {
    const r = parseArg(args[3])
    if (!r.ok) return r.err
    pv = r.n
  }
  let type = 0
  if (args.length === 5) {
    const r = parseTypeArg(args[4])
    if (!r.ok) return r.err
    type = r.n
  }
  const result = futureValue(rate.n, nper.n, pmt.n, pv, type)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

// ---------------------------------------------------------------------------
// PMT
// ---------------------------------------------------------------------------

export const PMT: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const nper = parseArg(args[1])
  if (!nper.ok) return nper.err
  const pv = parseArg(args[2])
  if (!pv.ok) return pv.err
  let fv = 0
  if (args.length >= 4) {
    const r = parseArg(args[3])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length === 5) {
    const r = parseTypeArg(args[4])
    if (!r.ok) return r.err
    type = r.n
  }
  if (nper.n === 0) return ERR('#NUM!')
  const result = periodicPayment(rate.n, nper.n, pv.n, fv, type)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

// ---------------------------------------------------------------------------
// NPER
// ---------------------------------------------------------------------------

export const NPER: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const pmt = parseArg(args[1])
  if (!pmt.ok) return pmt.err
  const pv = parseArg(args[2])
  if (!pv.ok) return pv.err
  let fv = 0
  if (args.length >= 4) {
    const r = parseArg(args[3])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length === 5) {
    const r = parseTypeArg(args[4])
    if (!r.ok) return r.err
    type = r.n
  }
  if (rate.n === 0 && pmt.n === 0) return ERR('#NUM!')
  const result = numberOfPeriods(rate.n, pmt.n, pv.n, fv, type)
  if (!Number.isFinite(result) || Number.isNaN(result)) return ERR('#NUM!')
  return NUM(result)
}

// ---------------------------------------------------------------------------
// RATE — Newton-Raphson root finder
// ---------------------------------------------------------------------------

/**
 * Residual of the annuity identity, with `rate` as the unknown.
 * `f(rate) = 0` at the correct rate.
 */
export function rateResidual(
  rate: number,
  nper: number,
  pmt: number,
  pv: number,
  fv: number,
  type: number,
): number {
  if (rate === 0) {
    return pv + pmt * nper + fv
  }
  const pow = Math.pow(1 + rate, nper)
  return pv * pow + pmt * (1 + rate * type) * (pow - 1) / rate + fv
}

/**
 * Numerical derivative of the residual w.r.t. `rate`. Central-difference
 * quotient is good enough for Newton-Raphson convergence here; the
 * step size scales with `rate` to stay well-conditioned near zero.
 *
 * We chose a numerical derivative over the closed-form one because:
 *  1. The closed-form `df/dr` for the annuity identity is a 3-term
 *     expression that's easy to typo.
 *  2. Central difference at scaled `eps` converges to the same root
 *     in roughly the same number of iterations.
 *
 * TODO(F1): if convergence becomes a performance concern, swap in the
 * analytical derivative — it's about 2× faster per step.
 */
export function rateDerivative(
  rate: number,
  nper: number,
  pmt: number,
  pv: number,
  fv: number,
  type: number,
): number {
  const eps = Math.max(1e-8, Math.abs(rate) * 1e-6)
  const left = rateResidual(rate - eps, nper, pmt, pv, fv, type)
  const right = rateResidual(rate + eps, nper, pmt, pv, fv, type)
  return (right - left) / (2 * eps)
}

export function rateResidualScale(
  rate: number,
  nper: number,
  pmt: number,
  pv: number,
  fv: number,
  type: number,
): number {
  if (rate === 0) {
    return Math.abs(pv) + Math.abs(pmt * nper) + Math.abs(fv)
  }
  const pow = Math.pow(1 + rate, nper)
  const pmtTerm = pmt * (1 + rate * type) * (pow - 1) / rate
  return Math.abs(pv * pow) + Math.abs(pmtTerm) + Math.abs(fv)
}

export const RATE: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const nper = parseArg(args[0])
  if (!nper.ok) return nper.err
  const pmt = parseArg(args[1])
  if (!pmt.ok) return pmt.err
  const pv = parseArg(args[2])
  if (!pv.ok) return pv.err
  let fv = 0
  if (args.length >= 4) {
    const r = parseArg(args[3])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length >= 5) {
    const r = parseTypeArg(args[4])
    if (!r.ok) return r.err
    type = r.n
  }
  let guess = 0.1
  if (args.length === 6) {
    const r = parseArg(args[5])
    if (!r.ok) return r.err
    guess = r.n
  }

  const zeroResidual = rateResidual(0, nper.n, pmt.n, pv.n, fv, type)
  const zeroScale = rateResidualScale(0, nper.n, pmt.n, pv.n, fv, type)
  if ((args.length < 6 || guess === 0.1) && rateResidualConverged(zeroResidual, zeroScale)) {
    return NUM(0)
  }

  let rate = guess
  for (let i = 0; i < NR_MAX_ITERS; i++) {
    const f = rateResidual(rate, nper.n, pmt.n, pv.n, fv, type)
    const scale = rateResidualScale(rate, nper.n, pmt.n, pv.n, fv, type)
    if (rateResidualConverged(f, scale)) return NUM(rate)
    const fprime = rateDerivative(rate, nper.n, pmt.n, pv.n, fv, type)
    if (fprime === 0 || !Number.isFinite(fprime)) return ERR('#NUM!')
    const step = f / fprime
    const next = rate - step
    if (!Number.isFinite(next)) return ERR('#NUM!')
    // Converged on step size (rate stopped changing materially).
    if (Math.abs(step) < NR_TOLERANCE) {
      const nextResidual = rateResidual(next, nper.n, pmt.n, pv.n, fv, type)
      const nextScale = rateResidualScale(next, nper.n, pmt.n, pv.n, fv, type)
      return rateResidualConverged(nextResidual, nextScale)
        ? NUM(next)
        : ERR('#NUM!')
    }
    rate = next
  }
  // Final pass: declare success if the rate stopped changing even
  // though `|f|` is still above 1e-7 — this happens when the residual
  // surface is shallow near the root. Excel does the same.
  const final = rateResidual(rate, nper.n, pmt.n, pv.n, fv, type)
  const finalScale = rateResidualScale(rate, nper.n, pmt.n, pv.n, fv, type)
  if (rateResidualConverged(final, finalScale)) return NUM(rate)
  return ERR('#NUM!')
}
