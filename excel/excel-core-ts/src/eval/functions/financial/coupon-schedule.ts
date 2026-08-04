import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR } from './shared'
import { dayDiff, couponPeriodDays, prevCouponDate, nextCouponDate, couponNumber, couponPeriodSplit } from './bond-calendar'
import { finiteNumber, parseSettlementMaturityFrequencyBasis } from './bond-primitives'

export const COUPDAYBS: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  return NUM(Math.max(dayDiff(
    prevCouponDate(parsed.settlement, parsed.maturity, parsed.frequency),
    parsed.settlement,
  ), 0))
}

export const COUPDAYS: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  if (parsed.basis === 1) {
    return NUM(dayDiff(
      prevCouponDate(parsed.settlement, parsed.maturity, parsed.frequency),
      nextCouponDate(parsed.settlement, parsed.maturity, parsed.frequency),
    ))
  }
  return finiteNumber(couponPeriodDays(parsed.frequency, parsed.basis))
}

export const COUPDAYSNC: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  const next = nextCouponDate(parsed.settlement, parsed.maturity, parsed.frequency)
  if (parsed.basis === 1) return NUM(Math.max(dayDiff(parsed.settlement, next), 0))
  const { dsc } = couponPeriodSplit(
    parsed.settlement,
    parsed.maturity,
    parsed.frequency,
    parsed.basis,
  )
  return finiteNumber(dsc)
}

export const COUPNCD: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  return NUM(nextCouponDate(parsed.settlement, parsed.maturity, parsed.frequency))
}

export const COUPNUM: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  return finiteNumber(couponNumber(parsed.settlement, parsed.maturity, parsed.frequency))
}

export const COUPPCD: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const parsed = parseSettlementMaturityFrequencyBasis(args)
  if (!parsed.ok) return parsed.err
  return NUM(prevCouponDate(parsed.settlement, parsed.maturity, parsed.frequency))
}
