import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, NR_TOLERANCE, BOND_MAX_ITERS, parseArg } from './shared'
import { parseBasis, parseFrequency, yearFracBasis } from './bond-calendar'
import { macaulayDuration, priceFromYield, finiteNumber } from './bond-primitives'

export const DURATION: FunctionImpl = (args) => {
  if (args.length < 5 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const coupon = parseArg(args[2])
  if (!coupon.ok) return coupon.err
  const yld = parseArg(args[3])
  if (!yld.ok) return yld.err
  const frequency = parseFrequency(args[4])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 5)
  if (!basis.ok) return basis.err
  if (coupon.n < 0 || yld.n < 0 || settlement.n >= maturity.n) return ERR('#NUM!')
  return finiteNumber(
    macaulayDuration(
      settlement.n,
      maturity.n,
      coupon.n,
      yld.n,
      frequency.frequency,
      basis.basis,
    ),
  )
}

export const MDURATION: FunctionImpl = (args) => {
  if (args.length < 5 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const coupon = parseArg(args[2])
  if (!coupon.ok) return coupon.err
  const yld = parseArg(args[3])
  if (!yld.ok) return yld.err
  const frequency = parseFrequency(args[4])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 5)
  if (!basis.ok) return basis.err
  if (coupon.n < 0 || yld.n < 0 || settlement.n >= maturity.n) return ERR('#NUM!')
  const denom = 1 + yld.n / frequency.frequency
  if (denom === 0) return ERR('#DIV/0!')
  const duration = macaulayDuration(
    settlement.n,
    maturity.n,
    coupon.n,
    yld.n,
    frequency.frequency,
    basis.basis,
  )
  return finiteNumber(duration / denom)
}

export const PRICE: FunctionImpl = (args) => {
  if (args.length < 6 || args.length > 7) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const rate = parseArg(args[2])
  if (!rate.ok) return rate.err
  const yld = parseArg(args[3])
  if (!yld.ok) return yld.err
  const redemption = parseArg(args[4])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[5])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 6)
  if (!basis.ok) return basis.err
  if (rate.n < 0 || yld.n < 0 || redemption.n <= 0 || settlement.n >= maturity.n) {
    return ERR('#NUM!')
  }
  return finiteNumber(
    priceFromYield(
      settlement.n,
      maturity.n,
      rate.n,
      yld.n,
      redemption.n,
      frequency.frequency,
      basis.basis,
    ),
  )
}

export const YIELD: FunctionImpl = (args) => {
  if (args.length < 6 || args.length > 7) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const rate = parseArg(args[2])
  if (!rate.ok) return rate.err
  const pr = parseArg(args[3])
  if (!pr.ok) return pr.err
  const redemption = parseArg(args[4])
  if (!redemption.ok) return redemption.err
  const frequency = parseFrequency(args[5])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 6)
  if (!basis.ok) return basis.err
  if (rate.n < 0 || pr.n <= 0 || redemption.n <= 0 || settlement.n >= maturity.n) {
    return ERR('#NUM!')
  }

  let yld = Math.max(rate.n, 0.05)
  for (let i = 0; i < BOND_MAX_ITERS; i += 1) {
    const price = priceFromYield(
      settlement.n,
      maturity.n,
      rate.n,
      yld,
      redemption.n,
      frequency.frequency,
      basis.basis,
    )
    const dy = 1e-6
    const price2 = priceFromYield(
      settlement.n,
      maturity.n,
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

export const PRICEDISC: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const discount = parseArg(args[2])
  if (!discount.ok) return discount.err
  const redemption = parseArg(args[3])
  if (!redemption.ok) return redemption.err
  const basis = parseBasis(args, 4)
  if (!basis.ok) return basis.err
  if (discount.n <= 0 || redemption.n <= 0 || settlement.n >= maturity.n) return ERR('#NUM!')
  const yf = yearFracBasis(settlement.n, maturity.n, basis.basis)
  return finiteNumber(redemption.n * (1 - discount.n * yf))
}

export const YIELDDISC: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const pr = parseArg(args[2])
  if (!pr.ok) return pr.err
  const redemption = parseArg(args[3])
  if (!redemption.ok) return redemption.err
  const basis = parseBasis(args, 4)
  if (!basis.ok) return basis.err
  if (pr.n <= 0 || redemption.n <= 0 || settlement.n >= maturity.n) return ERR('#NUM!')
  const yf = yearFracBasis(settlement.n, maturity.n, basis.basis)
  if (yf === 0) return ERR('#DIV/0!')
  return finiteNumber((redemption.n - pr.n) / pr.n / yf)
}

export const PRICEMAT: FunctionImpl = (args) => {
  if (args.length < 5 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const issue = parseArg(args[2])
  if (!issue.ok) return issue.err
  const rate = parseArg(args[3])
  if (!rate.ok) return rate.err
  const yld = parseArg(args[4])
  if (!yld.ok) return yld.err
  const basis = parseBasis(args, 5)
  if (!basis.ok) return basis.err
  if (rate.n < 0 || yld.n < 0 || settlement.n >= maturity.n || issue.n >= settlement.n) {
    return ERR('#NUM!')
  }
  const dim = yearFracBasis(issue.n, maturity.n, basis.basis)
  const a = yearFracBasis(issue.n, settlement.n, basis.basis)
  const dsm = yearFracBasis(settlement.n, maturity.n, basis.basis)
  const denom = 1 + dsm * yld.n
  if (denom === 0) return ERR('#DIV/0!')
  return finiteNumber((100 + dim * rate.n * 100) / denom - a * rate.n * 100)
}

export const YIELDMAT: FunctionImpl = (args) => {
  if (args.length < 5 || args.length > 6) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const issue = parseArg(args[2])
  if (!issue.ok) return issue.err
  const rate = parseArg(args[3])
  if (!rate.ok) return rate.err
  const pr = parseArg(args[4])
  if (!pr.ok) return pr.err
  const basis = parseBasis(args, 5)
  if (!basis.ok) return basis.err
  if (rate.n < 0 || pr.n <= 0 || settlement.n >= maturity.n || issue.n >= settlement.n) {
    return ERR('#NUM!')
  }
  const dim = yearFracBasis(issue.n, maturity.n, basis.basis)
  const a = yearFracBasis(issue.n, settlement.n, basis.basis)
  const dsm = yearFracBasis(settlement.n, maturity.n, basis.basis)
  if (dsm === 0) return ERR('#DIV/0!')
  const denom = pr.n / 100 + a * rate.n
  if (denom === 0) return ERR('#DIV/0!')
  return finiteNumber(((1 + dim * rate.n) / denom - 1) / dsm)
}
