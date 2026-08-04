import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, parseArg } from './shared'
import { parseBasis, parseFrequency, dayDiff, yearFracBasis } from './bond-calendar'
import { finiteNumber } from './bond-primitives'

export const DOLLARDE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const fracDollar = parseArg(args[0])
  if (!fracDollar.ok) return fracDollar.err
  const fraction = parseArg(args[1])
  if (!fraction.ok) return fraction.err
  const denominator = Math.trunc(fraction.n)
  if (denominator < 0) return ERR('#NUM!')
  if (denominator < 1) return ERR('#DIV/0!')
  const sign = fracDollar.n < 0 ? -1 : 1
  const absolute = Math.abs(fracDollar.n)
  const intPart = Math.trunc(absolute)
  const fracPart = absolute - intPart
  const scale = Math.pow(10, Math.ceil(Math.log10(denominator)))
  return finiteNumber(sign * (intPart + fracPart * scale / denominator))
}

export const DOLLARFR: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const decDollar = parseArg(args[0])
  if (!decDollar.ok) return decDollar.err
  const fraction = parseArg(args[1])
  if (!fraction.ok) return fraction.err
  const denominator = Math.trunc(fraction.n)
  if (denominator < 0) return ERR('#NUM!')
  if (denominator < 1) return ERR('#DIV/0!')
  const sign = decDollar.n < 0 ? -1 : 1
  const absolute = Math.abs(decDollar.n)
  const intPart = Math.trunc(absolute)
  const decPart = absolute - intPart
  const scale = Math.pow(10, Math.ceil(Math.log10(denominator)))
  return finiteNumber(sign * (intPart + decPart * denominator / scale))
}

export const ACCRINT: FunctionImpl = (args) => {
  if (args.length < 6 || args.length > 8) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const issue = parseArg(args[0])
  if (!issue.ok) return issue.err
  const firstInterest = parseArg(args[1])
  if (!firstInterest.ok) return firstInterest.err
  const settlement = parseArg(args[2])
  if (!settlement.ok) return settlement.err
  const rate = parseArg(args[3])
  if (!rate.ok) return rate.err
  const par = parseArg(args[4])
  if (!par.ok) return par.err
  const frequency = parseFrequency(args[5])
  if (!frequency.ok) return frequency.err
  const basis = parseBasis(args, 6)
  if (!basis.ok) return basis.err
  let calcMethod = true
  if (args.length === 8) {
    const parsedCalcMethod = parseArg(args[7])
    if (!parsedCalcMethod.ok) return parsedCalcMethod.err
    calcMethod = parsedCalcMethod.n !== 0
  }
  if (rate.n <= 0 || par.n <= 0 || settlement.n <= issue.n) return ERR('#NUM!')
  const accrualStart = !calcMethod && settlement.n > firstInterest.n ? firstInterest.n : issue.n
  if (settlement.n <= accrualStart) return NUM(0)
  return finiteNumber(par.n * rate.n * yearFracBasis(accrualStart, settlement.n, basis.basis))
}

export const ACCRINTM: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const issue = parseArg(args[0])
  if (!issue.ok) return issue.err
  const settlement = parseArg(args[1])
  if (!settlement.ok) return settlement.err
  const rate = parseArg(args[2])
  if (!rate.ok) return rate.err
  const par = parseArg(args[3])
  if (!par.ok) return par.err
  const basis = parseBasis(args, 4)
  if (!basis.ok) return basis.err
  if (rate.n <= 0 || par.n <= 0 || settlement.n <= issue.n) return ERR('#NUM!')
  return finiteNumber(par.n * rate.n * yearFracBasis(issue.n, settlement.n, basis.basis))
}

export const DISC: FunctionImpl = (args) => {
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
  if (pr.n <= 0 || redemption.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const yf = yearFracBasis(settlement.n, maturity.n, basis.basis)
  if (yf === 0) return ERR('#DIV/0!')
  return finiteNumber((redemption.n - pr.n) / redemption.n / yf)
}

export const INTRATE: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const investment = parseArg(args[2])
  if (!investment.ok) return investment.err
  const redemption = parseArg(args[3])
  if (!redemption.ok) return redemption.err
  const basis = parseBasis(args, 4)
  if (!basis.ok) return basis.err
  if (investment.n <= 0 || redemption.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const yf = yearFracBasis(settlement.n, maturity.n, basis.basis)
  if (yf === 0) return ERR('#DIV/0!')
  return finiteNumber((redemption.n - investment.n) / investment.n / yf)
}

export const RECEIVED: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const investment = parseArg(args[2])
  if (!investment.ok) return investment.err
  const discount = parseArg(args[3])
  if (!discount.ok) return discount.err
  const basis = parseBasis(args, 4)
  if (!basis.ok) return basis.err
  if (investment.n <= 0 || discount.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const denom = 1 - discount.n * yearFracBasis(settlement.n, maturity.n, basis.basis)
  if (denom <= 0) return ERR('#NUM!')
  return finiteNumber(investment.n / denom)
}

export const TBILLEQ: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const discount = parseArg(args[2])
  if (!discount.ok) return discount.err
  if (discount.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const diff = dayDiff(settlement.n, maturity.n)
  if (diff > 365) return ERR('#NUM!')
  const denom = 360 - discount.n * diff
  if (denom <= 0) return ERR('#NUM!')
  return finiteNumber(365 * discount.n / denom)
}

export const TBILLPRICE: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const discount = parseArg(args[2])
  if (!discount.ok) return discount.err
  if (discount.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const diff = dayDiff(settlement.n, maturity.n)
  if (diff > 365) return ERR('#NUM!')
  return finiteNumber(100 * (1 - discount.n * diff / 360))
}

export const TBILLYIELD: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const settlement = parseArg(args[0])
  if (!settlement.ok) return settlement.err
  const maturity = parseArg(args[1])
  if (!maturity.ok) return maturity.err
  const pr = parseArg(args[2])
  if (!pr.ok) return pr.err
  if (pr.n <= 0 || maturity.n <= settlement.n) return ERR('#NUM!')
  const diff = dayDiff(settlement.n, maturity.n)
  if (diff <= 0 || diff > 365) return ERR('#NUM!')
  return finiteNumber((100 - pr.n) / pr.n * 360 / diff)
}
