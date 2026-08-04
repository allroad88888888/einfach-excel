import type { FunctionImpl } from '../../../types'
import { ERR_VAL, ctxStub, finiteNumber, numberArg, booleanArg } from './numeric'
import { probability } from './normal-distribution'
import {
  betaInvUnit,
  betaPdfUnit,
  gammaCdf,
  gammaPdf,
  gammaValue,
  inversePositiveCdfNewton,
} from './distribution-primitives'
import { logGamma, regularizedBeta } from './special-functions'

export const GAMMA_FUNC: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  if (x.value === 0 || (x.value < 0 && Math.trunc(x.value) === x.value)) return ERR_VAL('#NUM!')
  return finiteNumber(gammaValue(x.value))
}

export const GAMMALN: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  if (x.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(logGamma(x.value))
}

export const BETA_DIST: FunctionImpl = (args) => {
  if (args.length < 4 || args.length > 6) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const alpha = numberArg(args[1])
  if (!alpha.ok) return alpha.err
  const beta = numberArg(args[2])
  if (!beta.ok) return beta.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  const lower = args.length >= 5 ? numberArg(args[4]) : { ok: true, value: 0 } as const
  if (!lower.ok) return lower.err
  const upper = args.length === 6 ? numberArg(args[5]) : { ok: true, value: 1 } as const
  if (!upper.ok) return upper.err
  if (alpha.value <= 0 || beta.value <= 0 || upper.value <= lower.value) return ERR_VAL('#NUM!')
  if (x.value < lower.value || x.value > upper.value) return ERR_VAL('#NUM!')
  const scaled = (x.value - lower.value) / (upper.value - lower.value)
  const result = cumulative.value
    ? regularizedBeta(scaled, alpha.value, beta.value)
    : betaPdfUnit(scaled, alpha.value, beta.value) / (upper.value - lower.value)
  return probability(result)
}

export const BETADIST: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR_VAL('#VALUE!')
  return BETA_DIST(
    [args[0], args[1], args[2], { kind: 'boolean', value: true }, ...args.slice(3)],
    ctxStub,
  )
}

export const BETA_INV: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const alpha = numberArg(args[1])
  if (!alpha.ok) return alpha.err
  const beta = numberArg(args[2])
  if (!beta.ok) return beta.err
  const lower = args.length >= 4 ? numberArg(args[3]) : { ok: true, value: 0 } as const
  if (!lower.ok) return lower.err
  const upper = args.length === 5 ? numberArg(args[4]) : { ok: true, value: 1 } as const
  if (!upper.ok) return upper.err
  if (
    p.value < 0 ||
    p.value > 1 ||
    alpha.value <= 0 ||
    beta.value <= 0 ||
    upper.value <= lower.value
  ) {
    return ERR_VAL('#NUM!')
  }
  return finiteNumber(
    lower.value + betaInvUnit(p.value, alpha.value, beta.value) * (upper.value - lower.value),
  )
}

export const GAMMA_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const alpha = numberArg(args[1])
  if (!alpha.ok) return alpha.err
  const beta = numberArg(args[2])
  if (!beta.ok) return beta.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  if (x.value < 0 || alpha.value <= 0 || beta.value <= 0) return ERR_VAL('#NUM!')
  return probability(
    cumulative.value
      ? gammaCdf(x.value, alpha.value, beta.value)
      : gammaPdf(x.value, alpha.value, beta.value),
  )
}

export const GAMMA_INV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const alpha = numberArg(args[1])
  if (!alpha.ok) return alpha.err
  const beta = numberArg(args[2])
  if (!beta.ok) return beta.err
  if (p.value < 0 || p.value >= 1 || alpha.value <= 0 || beta.value <= 0) return ERR_VAL('#NUM!')
  // Newton seed = distribution mean (alpha * beta); falls back to bisection.
  const seed = alpha.value * beta.value
  return finiteNumber(
    inversePositiveCdfNewton(
      p.value,
      seed,
      (x) => gammaCdf(x, alpha.value, beta.value),
      (x) => gammaPdf(x, alpha.value, beta.value),
    ),
  )
}
