import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { ERR, parseArg } from './shared'
import { parseBasis, parseFrequency, yearFracBasis } from './bond-calendar'
import { finiteNumber } from './bond-primitives'
import { addCouponPeriods } from './odd-first-bonds'

export function oddlpriceFromYield(
  settlement: number,
  maturity: number,
  lastInterest: number,
  rate: number,
  yld: number,
  redemption: number,
  frequency: number,
  basis: number,
): number {
  let prevQuasi = lastInterest
  let periods = 1
  while (periods <= 4_000) {
    const nextQuasi = addCouponPeriods(lastInterest, frequency, periods)
    if (nextQuasi > settlement) break
    prevQuasi = nextQuasi
    periods += 1
  }
  if (periods > 4_000) return Number.NaN

  const aPeriods = yearFracBasis(prevQuasi, settlement, basis) * frequency
  const dsmPeriods = yearFracBasis(settlement, maturity, basis) * frequency
  const coupon = 100 * rate / frequency
  const factor = 1 + dsmPeriods * yld / frequency
  if (factor === 0 || !Number.isFinite(factor)) return Number.NaN
  return (dsmPeriods * coupon + redemption) / factor - aPeriods * coupon
}

export const ODDLPRICE: FunctionImpl = (args) => {
  if (args.length < 7 || args.length > 8) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const lastInterest = parseArg(args[2])
  if (!lastInterest.ok) return lastInterest.err
  const rate = parseArg(args[3])
  if (!rate.ok) return rate.err
  const yld = parseArg(args[4])
  if (!yld.ok) return yld.err
  const redemption = parseArg(args[5])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[6])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 7)
  if (!basis.ok) return basis.err
  if (
    rate.n < 0 ||
    yld.n < 0 ||
    redemption.n <= 0 ||
    lastInterest.n >= settlement.n ||
    settlement.n >= maturity.n
  ) {
    return ERR('#NUM!')
  }
  return finiteNumber(
    oddlpriceFromYield(
      settlement.n,
      maturity.n,
      lastInterest.n,
      rate.n,
      yld.n,
      redemption.n,
      frequency.frequency,
      basis.basis,
    ),
  )
}

export const ODDLYIELD: FunctionImpl = (args) => {
  if (args.length < 7 || args.length > 8) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const lastInterest = parseArg(args[2])
  if (!lastInterest.ok) return lastInterest.err
  const rate = parseArg(args[3])
  if (!rate.ok) return rate.err
  const pr = parseArg(args[4])
  if (!pr.ok) return pr.err
  const redemption = parseArg(args[5])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[6])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 7)
  if (!basis.ok) return basis.err
  if (
    rate.n < 0 ||
    pr.n <= 0 ||
    redemption.n <= 0 ||
    lastInterest.n >= settlement.n ||
    settlement.n >= maturity.n
  ) {
    return ERR('#NUM!')
  }

  let prevQuasi = lastInterest.n
  let periods = 1
  while (periods <= 4_000) {
    const nextQuasi = addCouponPeriods(lastInterest.n, frequency.frequency, periods)
    if (nextQuasi > settlement.n) break
    prevQuasi = nextQuasi
    periods += 1
  }
  if (periods > 4_000) return ERR('#NUM!')

  const f = frequency.frequency
  const aPeriods = yearFracBasis(prevQuasi, settlement.n, basis.basis) * f
  const dsmPeriods = yearFracBasis(settlement.n, maturity.n, basis.basis) * f
  if (dsmPeriods === 0) return ERR('#DIV/0!')
  const coupon = 100 * rate.n / f
  const denom = pr.n + aPeriods * coupon
  if (denom === 0) return ERR('#DIV/0!')
  return finiteNumber(f / dsmPeriods * ((dsmPeriods * coupon + redemption.n) / denom - 1))
}
