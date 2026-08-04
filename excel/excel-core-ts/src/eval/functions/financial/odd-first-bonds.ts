import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, NR_TOLERANCE, BOND_MAX_ITERS, parseArg } from './shared'
import { parseBasis, parseFrequency, serialDateToParts, serialFromDateParts, daysInMonth, yearFracBasis } from './bond-calendar'
import { finiteNumber } from './bond-primitives'

export function addCouponPeriods(quasiDate: number, frequency: number, periods: number): number {
  const monthsPerPeriod = 12 / frequency
  const parts = serialDateToParts(quasiDate)
  const monthIndex = parts.year * 12 + (parts.month - 1) + periods * monthsPerPeriod
  const year = Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12 + 1
  const day = Math.min(parts.day, daysInMonth(year, month))
  return serialFromDateParts(year, month, day)
}

export function ncQuasiDatesBetween(start: number, end: number, frequency: number): number {
  if (end <= start) return 0
  const monthsPerPeriod = 12 / frequency
  const endParts = serialDateToParts(end)
  let periods = 0
  while (periods <= 4_000) {
    const monthIndex = endParts.year * 12 + (endParts.month - 1) - periods * monthsPerPeriod
    const year = Math.floor(monthIndex / 12)
    const month = ((monthIndex % 12) + 12) % 12 + 1
    const day = Math.min(endParts.day, daysInMonth(year, month))
    const serial = serialFromDateParts(year, month, day)
    if (serial <= start) return periods
    periods += 1
  }
  return periods
}

export function oddfpriceFromYield(
  settlement: number,
  maturity: number,
  issue: number,
  firstCoupon: number,
  rate: number,
  yld: number,
  redemption: number,
  frequency: number,
  basis: number,
): number {
  const onePlus = 1 + yld / frequency
  if (onePlus <= 0) return Number.NaN
  const coupon = 100 * rate / frequency
  const nRegular = ncQuasiDatesBetween(firstCoupon, maturity, frequency)
  const nTotal = nRegular + 1
  const dsc = yearFracBasis(settlement, firstCoupon, basis) * frequency

  const prevQuasi = addCouponPeriods(firstCoupon, frequency, -1)
  let firstCouponPayment = 0
  let accrued = 0
  if (prevQuasi <= issue) {
    const dfc = yearFracBasis(issue, firstCoupon, basis) * frequency
    const a = yearFracBasis(issue, settlement, basis) * frequency
    firstCouponPayment = coupon * dfc
    accrued = coupon * a
  } else {
    const nq = Math.max(ncQuasiDatesBetween(issue, firstCoupon, frequency), 1)
    const quasiDates: number[] = []
    for (let i = 0; i <= nq; i += 1) {
      quasiDates.push(addCouponPeriods(firstCoupon, frequency, -i))
    }
    const qIssueLo = quasiDates[nq]
    const qIssueHi = quasiDates[nq - 1]
    const nlIssue = Math.max(qIssueHi - qIssueLo, 1)
    const dciFrac = Math.max(qIssueHi - issue, 0) / nlIssue
    const firstPeriodCouponFrac = dciFrac + nq - 1
    let accruedPeriods = 0
    if (settlement <= qIssueHi) {
      accruedPeriods = Math.max(settlement - issue, 0) / nlIssue
    } else {
      let frac = dciFrac
      let found = false
      for (let i = 1; i < nq; i += 1) {
        const qLo = quasiDates[nq - i]
        const qHi = quasiDates[nq - i - 1]
        if (settlement >= qLo && settlement <= qHi) {
          const nl = Math.max(qHi - qLo, 1)
          frac += Math.max(settlement - qLo, 0) / nl
          found = true
          break
        }
        frac += 1
      }
      accruedPeriods = found ? frac : firstPeriodCouponFrac
    }
    firstCouponPayment = coupon * firstPeriodCouponFrac
    accrued = coupon * accruedPeriods
  }

  let pv = firstCouponPayment / Math.pow(onePlus, dsc)
  for (let k = 2; k <= nTotal; k += 1) {
    pv += coupon / Math.pow(onePlus, dsc + k - 1)
  }
  const redemptionPv = redemption / Math.pow(onePlus, dsc + nTotal - 1)
  return pv + redemptionPv - accrued
}

export const ODDFPRICE: FunctionImpl = (args) => {
  if (args.length < 8 || args.length > 9) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const issue = parseArg(args[2])
  if (!issue.ok) return issue.err
  const firstCoupon = parseArg(args[3])
  if (!firstCoupon.ok) return firstCoupon.err
  const rate = parseArg(args[4])
  if (!rate.ok) return rate.err
  const yld = parseArg(args[5])
  if (!yld.ok) return yld.err
  const redemption = parseArg(args[6])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[7])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 8)
  if (!basis.ok) return basis.err
  if (
    rate.n < 0 ||
    yld.n < 0 ||
    redemption.n <= 0 ||
    issue.n >= settlement.n ||
    settlement.n >= firstCoupon.n ||
    firstCoupon.n >= maturity.n
  ) {
    return ERR('#NUM!')
  }
  return finiteNumber(
    oddfpriceFromYield(
      settlement.n,
      maturity.n,
      issue.n,
      firstCoupon.n,
      rate.n,
      yld.n,
      redemption.n,
      frequency.frequency,
      basis.basis,
    ),
  )
}

export const ODDFYIELD: FunctionImpl = (args) => {
  if (args.length < 8 || args.length > 9) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const issue = parseArg(args[2])
  if (!issue.ok) return issue.err
  const firstCoupon = parseArg(args[3])
  if (!firstCoupon.ok) return firstCoupon.err
  const rate = parseArg(args[4])
  if (!rate.ok) return rate.err
  const pr = parseArg(args[5])
  if (!pr.ok) return pr.err
  const redemption = parseArg(args[6])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[7])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 8)
  if (!basis.ok) return basis.err
  if (
    rate.n < 0 ||
    pr.n <= 0 ||
    redemption.n <= 0 ||
    issue.n >= settlement.n ||
    settlement.n >= firstCoupon.n ||
    firstCoupon.n >= maturity.n
  ) {
    return ERR('#NUM!')
  }

  let yld = Math.max(rate.n, 0.05)
  for (let i = 0; i < BOND_MAX_ITERS; i += 1) {
    const price = oddfpriceFromYield(
      settlement.n,
      maturity.n,
      issue.n,
      firstCoupon.n,
      rate.n,
      yld,
      redemption.n,
      frequency.frequency,
      basis.basis,
    )
    const dy = 1e-6
    const price2 = oddfpriceFromYield(
      settlement.n,
      maturity.n,
      issue.n,
      firstCoupon.n,
      rate.n,
      yld + dy,
      redemption.n,
      frequency.frequency,
      basis.basis,
    )
    if (!Number.isFinite(price) || !Number.isFinite(price2)) return ERR('#NUM!')
    const diff = price - pr.n
    if (Math.abs(diff) < NR_TOLERANCE) return NUM(yld)
    const fp = (price2 - price) / dy
    if (fp === 0 || !Number.isFinite(fp)) return ERR('#NUM!')
    const next = yld - diff / fp
    if (!Number.isFinite(next)) return ERR('#NUM!')
    if (Math.abs(next - yld) < 1e-9) return NUM(next)
    yld = next
  }
  return ERR('#NUM!')
}
