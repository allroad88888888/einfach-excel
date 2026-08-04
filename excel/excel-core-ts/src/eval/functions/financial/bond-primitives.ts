import type { Value } from '../../../types'
import { NUM, ERR, parseArg } from './shared'
import { parseBasis, parseFrequency, couponNumber, couponPeriodSplit } from './bond-calendar'

export function macaulayDuration(
  settlement: number,
  maturity: number,
  coupon: number,
  yld: number,
  frequency: number,
  basis: number,
): number {
  const { dsc, e } = couponPeriodSplit(settlement, maturity, frequency, basis)
  if (!Number.isFinite(e) || e <= 0) return Number.NaN
  const dscE = dsc / e
  const couponCount = couponNumber(settlement, maturity, frequency)
  const periodicCoupon = 100 * coupon / frequency
  const redemption = 100
  const onePlus = 1 + yld / frequency
  if (onePlus <= 0) return Number.NaN

  let weighted = 0
  let pvTotal = 0
  for (let k = 1; k <= couponCount; k += 1) {
    const periods = k - 1 + dscE
    const years = periods / frequency
    const pv = periodicCoupon / Math.pow(onePlus, periods)
    weighted += years * pv
    pvTotal += pv
  }

  const redemptionPeriods = couponCount - 1 + dscE
  const redemptionYears = redemptionPeriods / frequency
  const redemptionPv = redemption / Math.pow(onePlus, redemptionPeriods)
  weighted += redemptionYears * redemptionPv
  pvTotal += redemptionPv
  if (pvTotal === 0 || !Number.isFinite(pvTotal)) return Number.NaN
  return weighted / pvTotal
}

export function priceFromYield(
  settlement: number,
  maturity: number,
  rate: number,
  yld: number,
  redemption: number,
  frequency: number,
  basis: number,
): number {
  const { a, dsc, e } = couponPeriodSplit(settlement, maturity, frequency, basis)
  if (!Number.isFinite(e) || e <= 0) return Number.NaN
  const n = couponNumber(settlement, maturity, frequency)
  const dscE = Math.max(dsc / e, 0)
  const coupon = 100 * rate / frequency
  const onePlus = 1 + yld / frequency
  if (onePlus <= 0) return Number.NaN

  let couponsPv = 0
  const nInt = Math.trunc(n)
  for (let k = 1; k <= nInt; k += 1) {
    couponsPv += coupon / Math.pow(onePlus, k - 1 + dscE)
  }
  const redemptionPv = redemption / Math.pow(onePlus, n - 1 + dscE)
  const accrued = coupon * a / e
  return redemptionPv + couponsPv - accrued
}

export function finiteNumber(value: number): Value {
  if (!Number.isFinite(value)) return ERR('#NUM!')
  return NUM(value)
}

export function parseSettlementMaturityFrequencyBasis(
  args: Value[],
): { ok: true; settlement: number; maturity: number; frequency: number; basis: number } |
  { ok: false; err: Value } {
  const settlement = parseArg(args[0])
  if (!settlement.ok) return { ok: false, err: settlement.err }
  const maturity = parseArg(args[1])
  if (!maturity.ok) return { ok: false, err: maturity.err }
  const frequency = parseFrequency(args[2])
  if (!frequency.ok) return { ok: false, err: frequency.err }
  const basis = parseBasis(args, 3)
  if (!basis.ok) return { ok: false, err: basis.err }
  if (settlement.n >= maturity.n) return { ok: false, err: ERR('#NUM!') }
  return {
    ok: true,
    settlement: settlement.n,
    maturity: maturity.n,
    frequency: frequency.frequency,
    basis: basis.basis,
  }
}
