import type { FunctionImpl } from '../../../types'
import { ERR_VAL, NUM, booleanArg, numberArg } from './numeric'
import { probability } from './normal-distribution'
import { binomCdf, binomPmf, integerValue } from './distribution-primitives'

export const BINOM_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const numS = numberArg(args[0])
  if (!numS.ok) return numS.err
  const trials = numberArg(args[1])
  if (!trials.ok) return trials.err
  const p = numberArg(args[2])
  if (!p.ok) return p.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  const k = integerValue(numS.value)
  const n = integerValue(trials.value)
  if (k === undefined || n === undefined || k < 0 || n < 0 || k > n || p.value < 0 || p.value > 1) {
    return ERR_VAL('#NUM!')
  }
  return probability(cumulative.value ? binomCdf(k, n, p.value) : binomPmf(k, n, p.value))
}

export const BINOM_INV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const trials = numberArg(args[0])
  if (!trials.ok) return trials.err
  const p = numberArg(args[1])
  if (!p.ok) return p.err
  const alpha = numberArg(args[2])
  if (!alpha.ok) return alpha.err
  const n = integerValue(trials.value)
  if (
    n === undefined ||
    n < 0 ||
    p.value <= 0 ||
    p.value >= 1 ||
    alpha.value <= 0 ||
    alpha.value >= 1
  ) {
    return ERR_VAL('#NUM!')
  }
  for (let k = 0; k <= n; k++) {
    if (binomCdf(k, n, p.value) >= alpha.value) return NUM(k)
  }
  return NUM(n)
}

export const BINOM_DIST_RANGE: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR_VAL('#VALUE!')
  const trials = numberArg(args[0])
  if (!trials.ok) return trials.err
  const p = numberArg(args[1])
  if (!p.ok) return p.err
  const lowerRaw = numberArg(args[2])
  if (!lowerRaw.ok) return lowerRaw.err
  const upperRaw = args.length === 4 ? numberArg(args[3]) : lowerRaw
  if (!upperRaw.ok) return upperRaw.err
  if (trials.value < 0 || p.value < 0 || p.value > 1) return ERR_VAL('#NUM!')
  const n = Math.trunc(trials.value)
  const lower = Math.trunc(lowerRaw.value)
  const upper = Math.trunc(upperRaw.value)
  if (lower < 0 || upper < lower || upper > n) return ERR_VAL('#NUM!')
  let total = 0
  for (let k = lower; k <= upper; k++) total += binomPmf(k, n, p.value)
  return probability(total)
}
