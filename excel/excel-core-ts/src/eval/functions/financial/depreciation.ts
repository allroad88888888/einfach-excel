import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { NUM, ERR, parseArg } from './shared'

export const SLN: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const salvage = parseArg(args[1])
  if (!salvage.ok) return salvage.err
  const life = parseArg(args[2])
  if (!life.ok) return life.err
  if (life.n <= 0) return ERR('#DIV/0!')
  const result = (cost.n - salvage.n) / life.n
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const SYD: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const salvage = parseArg(args[1])
  if (!salvage.ok) return salvage.err
  const life = parseArg(args[2])
  if (!life.ok) return life.err
  const per = parseArg(args[3])
  if (!per.ok) return per.err
  if (life.n <= 0 || per.n < 1 || per.n > life.n) return ERR('#NUM!')
  const result = (cost.n - salvage.n) * (life.n - per.n + 1) * 2 / (life.n * (life.n + 1))
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const DB: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const salvage = parseArg(args[1])
  if (!salvage.ok) return salvage.err
  const life = parseArg(args[2])
  if (!life.ok) return life.err
  const period = parseArg(args[3])
  if (!period.ok) return period.err
  let month = 12
  if (args.length === 5) {
    const r = parseArg(args[4])
    if (!r.ok) return r.err
    month = Math.trunc(r.n)
  }
  if (life.n <= 0 || period.n < 1 || month < 1 || month > 12) return ERR('#NUM!')
  if (cost.n === 0) return NUM(0)
  if (salvage.n < 0 || cost.n < 0 || (cost.n > 0 && salvage.n > cost.n)) return ERR('#NUM!')

  const rawRate = salvage.n === 0 ? 1 : 1 - Math.pow(salvage.n / cost.n, 1 / life.n)
  const rate = Math.round(rawRate * 1000) / 1000
  const lifeI = Math.trunc(life.n)
  const perI = Math.trunc(period.n)
  if (perI > lifeI + 1) return ERR('#NUM!')

  let total = 0
  let lastDep = 0
  const lastPeriod = Math.min(perI, lifeI + 1)
  for (let k = 1; k <= lastPeriod; k++) {
    const dep = k === 1
      ? cost.n * rate * month / 12
      : k === life.n + 1
        ? (cost.n - total) * rate * (12 - month) / 12
        : (cost.n - total) * rate
    lastDep = dep
    total += dep
  }
  if (!Number.isFinite(lastDep)) return ERR('#NUM!')
  return NUM(lastDep)
}

export function ddbPeriod(
  cost: number,
  salvage: number,
  life: number,
  period: number,
  factor: number,
): number {
  const rate = factor / life
  let prior = 0
  const pInt = Math.floor(period)
  for (let k = 1; k < pInt; k++) {
    const dep = Math.max(Math.min((cost - prior) * rate, cost - salvage - prior), 0)
    prior += dep
  }
  return Math.max(Math.min((cost - prior) * rate, cost - salvage - prior), 0)
}

export const DDB: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 5) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const salvage = parseArg(args[1])
  if (!salvage.ok) return salvage.err
  const life = parseArg(args[2])
  if (!life.ok) return life.err
  const period = parseArg(args[3])
  if (!period.ok) return period.err
  let factor = 2
  if (args.length === 5) {
    const r = parseArg(args[4])
    if (!r.ok) return r.err
    factor = r.n
  }
  if (cost.n < 0 || salvage.n < 0 || life.n <= 0 || period.n < 1 || factor <= 0) {
    return ERR('#NUM!')
  }
  if (period.n > life.n + 1) return ERR('#NUM!')
  const result = ddbPeriod(cost.n, salvage.n, life.n, period.n, factor)
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const VDB: FunctionImpl = (args) => {
  if (args.length < 5 || args.length > 7) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const cost = parseArg(args[0])
  if (!cost.ok) return cost.err
  const salvage = parseArg(args[1])
  if (!salvage.ok) return salvage.err
  const life = parseArg(args[2])
  if (!life.ok) return life.err
  const start = parseArg(args[3])
  if (!start.ok) return start.err
  const end = parseArg(args[4])
  if (!end.ok) return end.err
  let factor = 2
  if (args.length >= 6) {
    const r = parseArg(args[5])
    if (!r.ok) return r.err
    factor = r.n
  }
  let noSwitch = false
  if (args.length === 7) {
    const r = parseArg(args[6])
    if (!r.ok) return r.err
    noSwitch = r.n !== 0
  }
  if (cost.n < 0 || salvage.n < 0 || life.n <= 0 || factor <= 0) return ERR('#NUM!')
  if (start.n < 0 || end.n < start.n || end.n > life.n) return ERR('#NUM!')

  const rate = factor / life.n
  const lifeI = Math.ceil(life.n)
  let prior = 0
  let switched = false
  const perDep: number[] = []
  for (let k = 1; k <= lifeI; k++) {
    const ddbDep = Math.max(Math.min((cost.n - prior) * rate, cost.n - salvage.n - prior), 0)
    let dep = ddbDep
    if (!noSwitch) {
      const remainingPeriods = life.n - (k - 1)
      const slDep = remainingPeriods > 0
        ? Math.max((cost.n - salvage.n - prior) / remainingPeriods, 0)
        : 0
      if (switched || slDep > ddbDep) {
        switched = true
        dep = slDep
      }
    }
    perDep.push(dep)
    prior += dep
  }

  let total = 0
  const sFloor = Math.floor(start.n)
  const eCeil = Math.ceil(end.n)
  for (let k = Math.max(sFloor + 1, 1); k <= Math.min(eCeil, lifeI); k++) {
    const idx = k - 1
    const periodStart = k - 1
    const periodEnd = k
    const sliceStart = Math.max(start.n, periodStart)
    const sliceEnd = Math.min(end.n, periodEnd)
    if (sliceEnd > sliceStart) {
      total += perDep[idx] * (sliceEnd - sliceStart) / (periodEnd - periodStart)
    }
  }
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}
