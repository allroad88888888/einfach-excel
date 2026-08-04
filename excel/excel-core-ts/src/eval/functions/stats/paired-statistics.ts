import type { FunctionImpl, Value } from '../../../types'
import { ERR_VAL, NUM, collectNumberPairs } from './numeric'

/** Correlation coefficient: Pearson r between two equal-length arrays. */
export const CORREL: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const collected = collectNumberPairs(args[0], args[1])
  if (!collected.ok) return collected.err
  const pairs = collected.pairs
  if (pairs.length === 0) return ERR_VAL('#DIV/0!')
  const n = pairs.length
  const meanA = pairs.reduce((s, p) => s + p.x, 0) / n
  const meanB = pairs.reduce((s, p) => s + p.y, 0) / n
  let cov = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < n; i++) {
    const da = pairs[i].x - meanA
    const db = pairs[i].y - meanB
    cov += da * db
    sa += da * da
    sb += db * db
  }
  if (sa === 0 || sb === 0) return ERR_VAL('#DIV/0!')
  return NUM(cov / Math.sqrt(sa * sb))
}

function covariance(args: Value[], sample: boolean): Value {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const collected = collectNumberPairs(args[0], args[1])
  if (!collected.ok) return collected.err
  const pairs = collected.pairs
  const n = pairs.length
  if (n === 0 || (sample && n < 2)) return ERR_VAL('#DIV/0!')
  const meanA = pairs.reduce((s, p) => s + p.x, 0) / n
  const meanB = pairs.reduce((s, p) => s + p.y, 0) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += (pairs[i].x - meanA) * (pairs[i].y - meanB)
  }
  return NUM(sum / (sample ? n - 1 : n))
}

/** COVARIANCE.P / COVAR — population covariance. */
export const COVARIANCE_P: FunctionImpl = (args) => covariance(args, false)

/** COVARIANCE.S — sample covariance. */
export const COVARIANCE_S: FunctionImpl = (args) => covariance(args, true)

/** SLOPE(known_ys, known_xs) — linear regression slope. */
export const SLOPE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const collected = collectNumberPairs(args[1], args[0])
  if (!collected.ok) return collected.err
  const pairs = collected.pairs
  const n = pairs.length
  if (n < 2) return ERR_VAL('#DIV/0!')
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = pairs[i].x - meanX
    num += dx * (pairs[i].y - meanY)
    den += dx * dx
  }
  if (den === 0) return ERR_VAL('#DIV/0!')
  return NUM(num / den)
}

/** INTERCEPT(known_ys, known_xs) — y-intercept of linear regression. */
export const INTERCEPT: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const collected = collectNumberPairs(args[1], args[0])
  if (!collected.ok) return collected.err
  const pairs = collected.pairs
  const n = pairs.length
  if (n < 2) return ERR_VAL('#DIV/0!')
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = pairs[i].x - meanX
    num += dx * (pairs[i].y - meanY)
    den += dx * dx
  }
  if (den === 0) return ERR_VAL('#DIV/0!')
  const slope = num / den
  return NUM(meanY - slope * meanX)
}
