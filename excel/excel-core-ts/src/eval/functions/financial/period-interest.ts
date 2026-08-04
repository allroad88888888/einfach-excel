import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, parseArg, parseTypeArg, annuityCompound, periodicPayment } from './shared'

export function interestForPeriod(
  rate: number,
  per: number,
  nper: number,
  pv: number,
  fv: number,
  type: number,
): number {
  const pmt = periodicPayment(rate, nper, pv, fv, type)
  if (type === 1 && per === 1) return 0
  if (rate === 0) return 0
  const k = type === 1 ? per - 2 : per - 1
  const balance = pv * Math.pow(1 + rate, k) + pmt * annuityCompound(rate, k)
  return -balance * rate
}

export const IPMT: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const per = parseArg(args[1])
  if (!per.ok) return per.err
  const nper = parseArg(args[2])
  if (!nper.ok) return nper.err
  const pv = parseArg(args[3])
  if (!pv.ok) return pv.err
  let fv = 0
  if (args.length >= 5) {
    const r = parseArg(args[4])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length === 6) {
    const r = parseTypeArg(args[5])
    if (!r.ok) return r.err
    type = r.n
  }
  if (per.n < 1 || per.n > nper.n) return ERR('#NUM!')
  if (nper.n === 0) return ERR('#NUM!')
  const result = interestForPeriod(rate.n, Math.trunc(per.n), nper.n, pv.n, fv, type)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const PPMT: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const per = parseArg(args[1])
  if (!per.ok) return per.err
  const nper = parseArg(args[2])
  if (!nper.ok) return nper.err
  const pv = parseArg(args[3])
  if (!pv.ok) return pv.err
  let fv = 0
  if (args.length >= 5) {
    const r = parseArg(args[4])
    if (!r.ok) return r.err
    fv = r.n
  }
  let type = 0
  if (args.length === 6) {
    const r = parseTypeArg(args[5])
    if (!r.ok) return r.err
    type = r.n
  }
  if (per.n < 1 || per.n > nper.n) return ERR('#NUM!')
  if (nper.n === 0) return ERR('#NUM!')
  const pmt = periodicPayment(rate.n, nper.n, pv.n, fv, type)
  const ipmt = interestForPeriod(rate.n, Math.trunc(per.n), nper.n, pv.n, fv, type)
  // PMT = IPMT + PPMT (sign-aware identity).
  const result = pmt - ipmt
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

// ---------------------------------------------------------------------------
// CUMIPMT — cumulative interest over a range of periods
// ---------------------------------------------------------------------------

/**
 * CUMIPMT(rate, nper, pv, start_period, end_period, type) — cumulative
 * interest paid between `start_period` and `end_period` (inclusive,
 * 1-based).
 *
 * Note: unlike the other functions in this file, CUMIPMT *requires* the
 * type argument (it's positional 5, not optional). Excel's contract.
 */
export const CUMIPMT: FunctionImpl = (args) => {
  if (args.length !== 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const nper = parseArg(args[1])
  if (!nper.ok) return nper.err
  const pv = parseArg(args[2])
  if (!pv.ok) return pv.err
  const start = parseArg(args[3])
  if (!start.ok) return start.err
  const end = parseArg(args[4])
  if (!end.ok) return end.err
  const typeR = parseTypeArg(args[5])
  if (!typeR.ok) return typeR.err
  const type = typeR.n

  if (rate.n <= 0 || nper.n <= 0 || pv.n <= 0) return ERR('#NUM!')
  const s = Math.trunc(start.n)
  const e = Math.trunc(end.n)
  if (s < 1 || e < 1 || s > e || e > nper.n) return ERR('#NUM!')

  let total = 0
  for (let p = s; p <= e; p++) {
    total += interestForPeriod(rate.n, p, nper.n, pv.n, 0, type)
  }
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}
