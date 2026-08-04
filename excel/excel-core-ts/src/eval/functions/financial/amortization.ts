import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, parseArg, parseTypeArg, periodicPayment } from './shared'
import { parseBasis, yearFracBasis } from './bond-calendar'
import { finiteNumber } from './bond-primitives'
import { interestForPeriod } from './period-interest'

export function amordegrcCoefficient(life: number): number {
  if (life > 6) return 2.5
  if (life > 4) return 2
  if (life > 3) return 1.5
  return 1
}

export const AMORDEGRC: FunctionImpl = (args) => {
  if (args.length < 6 || args.length > 7) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const purchased = parseArg(args[1])
  if (!purchased.ok) return purchased.err
  const firstPeriod = parseArg(args[2])
  if (!firstPeriod.ok) return firstPeriod.err
  const salvage = parseArg(args[3])
  if (!salvage.ok) return salvage.err
  const period = parseArg(args[4])
  if (!period.ok) return period.err
  const rate = parseArg(args[5])
  if (!rate.ok) return rate.err
  const basis = parseBasis(args, 6)
  if (!basis.ok) return basis.err

  const p = Math.trunc(period.n)
  if (
    cost.n <= 0 ||
    salvage.n < 0 ||
    salvage.n >= cost.n ||
    p < 0 ||
    rate.n <= 0 ||
    rate.n >= 1 ||
    purchased.n > firstPeriod.n
  ) {
    return ERR('#NUM!')
  }

  const life = 1 / rate.n
  const ddbRate = rate.n * amordegrcCoefficient(life)
  const lastPeriod = Math.ceil(life)
  if (p > lastPeriod) return NUM(0)

  const firstFrac = yearFracBasis(purchased.n, firstPeriod.n, basis.basis)
  const maxTotal = cost.n - salvage.n
  const firstDep = Math.max(Math.min(Math.round(cost.n * ddbRate * firstFrac), maxTotal), 0)
  if (p === 0) return finiteNumber(firstDep)

  let book = cost.n - firstDep
  let lastDep = firstDep
  for (let k = 1; k <= p; k += 1) {
    if (k === lastPeriod) {
      const remaining = Math.max(book - salvage.n, 0)
      lastDep = Math.max(Math.min(remaining * 1.5, remaining), 0)
      break
    }
    const ddbDep = Math.round(book * ddbRate)
    const remainingPeriods = Math.max(lastPeriod - k, 1)
    const slDep = Math.round((book - salvage.n) / remainingPeriods)
    let dep = slDep > ddbDep ? slDep : ddbDep
    dep = Math.max(Math.min(dep, Math.max(book - salvage.n, 0)), 0)
    lastDep = dep
    book -= dep
    if (book <= salvage.n) {
      if (k < p) lastDep = 0
      break
    }
  }

  return finiteNumber(lastDep)
}

export const AMORLINC: FunctionImpl = (args) => {
  if (args.length < 6 || args.length > 7) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const purchased = parseArg(args[1])
  if (!purchased.ok) return purchased.err
  const firstPeriod = parseArg(args[2])
  if (!firstPeriod.ok) return firstPeriod.err
  const salvage = parseArg(args[3])
  if (!salvage.ok) return salvage.err
  const period = parseArg(args[4])
  if (!period.ok) return period.err
  const rate = parseArg(args[5])
  if (!rate.ok) return rate.err
  const basis = parseBasis(args, 6)
  if (!basis.ok) return basis.err

  const p = Math.trunc(period.n)
  if (cost.n <= 0 || rate.n <= 0 || p < 0 || salvage.n < 0 || salvage.n >= cost.n) {
    return ERR('#NUM!')
  }

  const firstFrac = yearFracBasis(purchased.n, firstPeriod.n, basis.basis)
  const annual = cost.n * rate.n
  const firstDep = Math.max(
    Math.min(Math.round(cost.n * rate.n * firstFrac), cost.n - salvage.n),
    0,
  )
  if (p === 0) return finiteNumber(firstDep)

  let book = cost.n - firstDep
  let lastDep = firstDep
  for (let k = 1; k <= p; k += 1) {
    if (book <= salvage.n) {
      lastDep = 0
      break
    }
    const dep = Math.max(Math.min(annual, book - salvage.n), 0)
    lastDep = dep
    book -= dep
  }

  return finiteNumber(lastDep)
}

// ---------------------------------------------------------------------------
// Additional financial aggregates and rates
// ---------------------------------------------------------------------------

export const CUMPRINC: FunctionImpl = (args) => {
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

  const pmt = periodicPayment(rate.n, nper.n, pv.n, 0, type)
  if (!Number.isFinite(pmt)) return ERR('#NUM!')
  let total = 0
  for (let p = s; p <= e; p++) {
    total += pmt - interestForPeriod(rate.n, p, nper.n, pv.n, 0, type)
  }
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}

export const EFFECT: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const nominal = parseArg(args[0])
  if (!nominal.ok) return nominal.err
  const npery = parseArg(args[1])
  if (!npery.ok) return npery.err
  const n = Math.trunc(npery.n)
  if (nominal.n <= 0 || n < 1) return ERR('#NUM!')
  const result = Math.pow(1 + nominal.n / n, n) - 1
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const NOMINAL: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const effect = parseArg(args[0])
  if (!effect.ok) return effect.err
  const npery = parseArg(args[1])
  if (!npery.ok) return npery.err
  const n = Math.trunc(npery.n)
  if (effect.n <= 0 || n < 1) return ERR('#NUM!')
  const result = (Math.pow(1 + effect.n, 1 / n) - 1) * n
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const ISPMT: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR('#VALUE!')
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
  if (nper.n === 0) return ERR('#DIV/0!')
  const result = -pv.n * rate.n * (1 - per.n / nper.n)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}
