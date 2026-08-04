import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { NUM, ERR, NR_TOLERANCE, XIRR_MAX_ITERS, parseArg, residualConverged } from './shared'
import { collectCashflows } from './cashflow-returns'

export type NumberList = { ok: true; values: number[] } | { ok: false; err: Value }

export function collectStrictNumbers(arg: Value, floorValues = false): NumberList {
  const out: number[] = []
  const visit = (value: Value): Value | undefined => {
    if (value.kind === 'error') return value
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) {
          const err = visit(cell)
          if (err) return err
        }
      }
      return undefined
    }
    if (value.kind === 'blank') return undefined
    if (value.kind !== 'number') return ERR('#VALUE!')
    if (!Number.isFinite(value.value)) return ERR('#NUM!')
    out.push(floorValues ? Math.floor(value.value) : value.value)
    return undefined
  }
  const err = visit(arg)
  if (err) return { ok: false, err }
  return { ok: true, values: out }
}

export function collectScheduleRates(arg: Value): NumberList {
  const out: number[] = []
  const visit = (value: Value): Value | undefined => {
    if (value.kind === 'error') return value
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) {
          const err = visit(cell)
          if (err) return err
        }
      }
      return undefined
    }
    if (value.kind === 'blank') return undefined
    const n = toNumber(value)
    if (!n.ok) return n.error
    if (!Number.isFinite(n.value)) return ERR('#NUM!')
    out.push(n.value)
    return undefined
  }
  const err = visit(arg)
  if (err) return { ok: false, err }
  return { ok: true, values: out }
}

export const FVSCHEDULE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const principal = parseArg(args[0])
  if (!principal.ok) return principal.err
  const rates = collectScheduleRates(args[1])
  if (!rates.ok) return rates.err
  let product = principal.n
  for (const rate of rates.values) {
    product *= 1 + rate
  }
  if (!Number.isFinite(product)) return ERR('#NUM!')
  return NUM(product)
}

export const MIRR: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const flows = collectCashflows([args[0]])
  if (!flows.ok) return flows.err
  const financeRate = parseArg(args[1])
  if (!financeRate.ok) return financeRate.err
  const reinvestRate = parseArg(args[2])
  if (!reinvestRate.ok) return reinvestRate.err

  let hasPos = false
  let hasNeg = false
  for (const value of flows.values) {
    if (value > 0) hasPos = true
    if (value < 0) hasNeg = true
  }
  if (!hasPos || !hasNeg || flows.values.length < 2) return ERR('#DIV/0!')
  if (financeRate.n <= -1 || reinvestRate.n <= -1) return ERR('#NUM!')

  const n = flows.values.length
  let pvNeg = 0
  let fvPos = 0
  for (let i = 0; i < n; i++) {
    const value = flows.values[i]
    if (value < 0) {
      const denom = Math.pow(1 + financeRate.n, i)
      if (denom === 0 || !Number.isFinite(denom)) return ERR('#NUM!')
      pvNeg += value / denom
    } else if (value > 0) {
      const pow = Math.pow(1 + reinvestRate.n, n - 1 - i)
      if (!Number.isFinite(pow)) return ERR('#NUM!')
      fvPos += value * pow
    }
  }
  if (pvNeg === 0) return ERR('#DIV/0!')
  const ratio = -fvPos / pvNeg
  if (ratio <= 0 || !Number.isFinite(ratio)) return ERR('#NUM!')
  const result = Math.pow(ratio, 1 / (n - 1)) - 1
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export type XirrPair = { date: number; value: number }
export type XirrPairs = { ok: true; pairs: XirrPair[] } | { ok: false; err: Value }

export function collectXirrPairs(valuesArg: Value, datesArg: Value): XirrPairs {
  const values = collectStrictNumbers(valuesArg)
  if (!values.ok) return { ok: false, err: values.err }
  const dates = collectStrictNumbers(datesArg, true)
  if (!dates.ok) return { ok: false, err: dates.err }
  if (values.values.length !== dates.values.length || values.values.length < 2) {
    return { ok: false, err: ERR('#NUM!') }
  }
  const pairs = values.values.map((value, i) => ({ date: dates.values[i], value }))
  const startDate = pairs[0].date
  for (const pair of pairs) {
    if (pair.date < startDate) return { ok: false, err: ERR('#NUM!') }
  }
  return { ok: true, pairs }
}

export const XNPV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  if (rate.n <= -1) return ERR('#NUM!')
  const pairs = collectXirrPairs(args[1], args[2])
  if (!pairs.ok) return pairs.err
  const d0 = pairs.pairs[0].date
  const base = 1 + rate.n
  if (base <= 0 || !Number.isFinite(base)) return ERR('#NUM!')

  let total = 0
  for (const pair of pairs.pairs) {
    const t = (pair.date - d0) / 365
    const denom = Math.pow(base, t)
    if (denom === 0 || !Number.isFinite(denom)) return ERR('#NUM!')
    total += pair.value / denom
  }
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}

export const XIRR: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const pairs = collectXirrPairs(args[0], args[1])
  if (!pairs.ok) return pairs.err

  let hasPos = false
  let hasNeg = false
  for (const pair of pairs.pairs) {
    if (pair.value > 0) hasPos = true
    if (pair.value < 0) hasNeg = true
  }
  if (!hasPos || !hasNeg) return ERR('#NUM!')

  let rate = 0.1
  if (args.length === 3) {
    const guess = parseArg(args[2])
    if (!guess.ok) return guess.err
    rate = guess.n
  }
  if (rate <= -1) return ERR('#NUM!')

  const d0 = pairs.pairs[0].date
  for (let i = 0; i < XIRR_MAX_ITERS; i++) {
    const base = 1 + rate
    if (base <= 0 || !Number.isFinite(base)) return ERR('#NUM!')
    let f = 0
    let fp = 0
    let scale = 0
    for (const pair of pairs.pairs) {
      const t = (pair.date - d0) / 365
      const denom = Math.pow(base, t)
      if (denom === 0 || !Number.isFinite(denom)) return ERR('#NUM!')
      const term = pair.value / denom
      f += term
      scale += Math.abs(term)
      fp += -t * pair.value / (denom * base)
    }
    if (!Number.isFinite(f) || !Number.isFinite(fp)) return ERR('#NUM!')
    if (residualConverged(f, scale)) return NUM(rate)
    if (fp === 0) return ERR('#NUM!')
    const next = rate - f / fp
    if (!Number.isFinite(next)) return ERR('#NUM!')
    if (Math.abs(next - rate) < NR_TOLERANCE) {
      const nextBase = 1 + next
      if (nextBase <= 0 || !Number.isFinite(nextBase)) return ERR('#NUM!')
      let nextResidual = 0
      let nextScale = 0
      for (const pair of pairs.pairs) {
        const t = (pair.date - d0) / 365
        const denom = Math.pow(nextBase, t)
        if (denom === 0 || !Number.isFinite(denom)) return ERR('#NUM!')
        const term = pair.value / denom
        nextResidual += term
        nextScale += Math.abs(term)
      }
      return residualConverged(nextResidual, nextScale) ? NUM(next) : ERR('#NUM!')
    }
    rate = next
  }
  const finalBase = 1 + rate
  if (finalBase <= 0 || !Number.isFinite(finalBase)) return ERR('#NUM!')
  let finalResidual = 0
  let finalScale = 0
  for (const pair of pairs.pairs) {
    const t = (pair.date - d0) / 365
    const denom = Math.pow(finalBase, t)
    if (denom === 0 || !Number.isFinite(denom)) return ERR('#NUM!')
    const term = pair.value / denom
    finalResidual += term
    finalScale += Math.abs(term)
  }
  if (residualConverged(finalResidual, finalScale)) return NUM(rate)
  return ERR('#NUM!')
}

export const PDURATION: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const rate = parseArg(args[0])
  if (!rate.ok) return rate.err
  const pv = parseArg(args[1])
  if (!pv.ok) return pv.err
  const fv = parseArg(args[2])
  if (!fv.ok) return fv.err
  if (rate.n <= 0 || pv.n <= 0 || fv.n <= 0) return ERR('#NUM!')
  const logBase = Math.log(1 + rate.n)
  if (logBase === 0) return ERR('#DIV/0!')
  const result = Math.log(fv.n / pv.n) / logBase
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}

export const RRI: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR('#VALUE!')
  const err = propagateError(args)
  if (err) return err
  const nper = parseArg(args[0])
  if (!nper.ok) return nper.err
  const pv = parseArg(args[1])
  if (!pv.ok) return pv.err
  const fv = parseArg(args[2])
  if (!fv.ok) return fv.err
  if (nper.n <= 0 || pv.n <= 0 || fv.n <= 0) return ERR('#NUM!')
  const result = Math.pow(fv.n / pv.n, 1 / nper.n) - 1
  if (!Number.isFinite(result)) return ERR('#NUM!')
  return NUM(result)
}
