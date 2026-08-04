import type { FunctionImpl } from '../../../types'
import { ERR_VAL, ctxStub, finiteNumber, meanOf, numberArg, booleanArg, collectNumbers } from './numeric'
import { probability, standardNormalCdf, standardNormalInv, standardNormalPdf } from './normal-distribution'
import { poissonCdf, poissonPmf, sampleVariance, studentTInv } from './student-distribution'

export const NORM_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const mean = numberArg(args[1])
  if (!mean.ok) return mean.err
  const standardDev = numberArg(args[2])
  if (!standardDev.ok) return standardDev.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  if (standardDev.value <= 0) return ERR_VAL('#NUM!')
  const z = (x.value - mean.value) / standardDev.value
  return probability(
    cumulative.value ? standardNormalCdf(z) : standardNormalPdf(z) / standardDev.value,
  )
}

export const NORM_S_DIST: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const z = numberArg(args[0])
  if (!z.ok) return z.err
  const cumulative = booleanArg(args[1])
  if (!cumulative.ok) return cumulative.err
  return probability(cumulative.value ? standardNormalCdf(z.value) : standardNormalPdf(z.value))
}

export const NORM_INV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const mean = numberArg(args[1])
  if (!mean.ok) return mean.err
  const standardDev = numberArg(args[2])
  if (!standardDev.ok) return standardDev.err
  if (p.value <= 0 || p.value >= 1 || standardDev.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(mean.value + standardDev.value * standardNormalInv(p.value))
}

export const NORM_S_INV: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  if (p.value <= 0 || p.value >= 1) return ERR_VAL('#NUM!')
  return finiteNumber(standardNormalInv(p.value))
}

export const NORMSDIST: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const z = numberArg(args[0])
  if (!z.ok) return z.err
  return probability(standardNormalCdf(z.value))
}

export const LOGNORM_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const mean = numberArg(args[1])
  if (!mean.ok) return mean.err
  const standardDev = numberArg(args[2])
  if (!standardDev.ok) return standardDev.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  if (x.value <= 0 || standardDev.value <= 0) return ERR_VAL('#NUM!')
  const z = (Math.log(x.value) - mean.value) / standardDev.value
  return probability(
    cumulative.value
      ? standardNormalCdf(z)
      : standardNormalPdf(z) / (x.value * standardDev.value),
  )
}

export const LOGNORM_INV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const mean = numberArg(args[1])
  if (!mean.ok) return mean.err
  const standardDev = numberArg(args[2])
  if (!standardDev.ok) return standardDev.err
  if (p.value <= 0 || p.value >= 1 || standardDev.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(Math.exp(mean.value + standardDev.value * standardNormalInv(p.value)))
}

export const LOGNORMDIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  return LOGNORM_DIST([...args, { kind: 'boolean', value: true }], ctxStub)
}

export const EXPON_DIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const lambda = numberArg(args[1])
  if (!lambda.ok) return lambda.err
  const cumulative = booleanArg(args[2])
  if (!cumulative.ok) return cumulative.err
  if (x.value < 0 || lambda.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(
    cumulative.value
      ? -Math.expm1(-lambda.value * x.value)
      : lambda.value * Math.exp(-lambda.value * x.value),
  )
}

export const POISSON_DIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const mean = numberArg(args[1])
  if (!mean.ok) return mean.err
  const cumulative = booleanArg(args[2])
  if (!cumulative.ok) return cumulative.err
  if (x.value < 0 || mean.value <= 0) return ERR_VAL('#NUM!')
  const k = Math.trunc(x.value)
  return probability(cumulative.value ? poissonCdf(k, mean.value) : poissonPmf(k, mean.value))
}

export const WEIBULL_DIST: FunctionImpl = (args) => {
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
  const scaled = x.value / beta.value
  const power = scaled ** alpha.value
  if (cumulative.value) return probability(-Math.expm1(-power))
  return finiteNumber((alpha.value / beta.value) * scaled ** (alpha.value - 1) * Math.exp(-power))
}

export const PHI: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  return finiteNumber(standardNormalPdf(x.value))
}

export const GAUSS: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  return probability(standardNormalCdf(x.value) - 0.5)
}

export const Z_TEST: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3) return ERR_VAL('#VALUE!')
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  const n = r.values.length
  if (n < 2) return ERR_VAL('#DIV/0!')
  const x = numberArg(args[1])
  if (!x.ok) return x.err
  const variance = sampleVariance(r.values)
  if (variance === undefined) return ERR_VAL('#DIV/0!')
  let sigma = Math.sqrt(variance)
  if (args.length === 3) {
    const supplied = numberArg(args[2])
    if (!supplied.ok) return supplied.err
    sigma = supplied.value
  }
  if (sigma <= 0) return ERR_VAL('#DIV/0!')
  const z = (meanOf(r.values) - x.value) / (sigma / Math.sqrt(n))
  return probability(1 - standardNormalCdf(z))
}

export const CONFIDENCE_NORM: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const alpha = numberArg(args[0])
  if (!alpha.ok) return alpha.err
  const standardDev = numberArg(args[1])
  if (!standardDev.ok) return standardDev.err
  const sizeRaw = numberArg(args[2])
  if (!sizeRaw.ok) return sizeRaw.err
  const size = Math.trunc(sizeRaw.value)
  if (alpha.value <= 0 || alpha.value >= 1 || standardDev.value <= 0 || size < 1) {
    return ERR_VAL('#NUM!')
  }
  return finiteNumber(standardNormalInv(1 - alpha.value / 2) * standardDev.value / Math.sqrt(size))
}

export const CONFIDENCE_T: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const alpha = numberArg(args[0])
  if (!alpha.ok) return alpha.err
  const standardDev = numberArg(args[1])
  if (!standardDev.ok) return standardDev.err
  const sizeRaw = numberArg(args[2])
  if (!sizeRaw.ok) return sizeRaw.err
  if (alpha.value <= 0 || alpha.value >= 1 || standardDev.value <= 0 || sizeRaw.value < 2) {
    return ERR_VAL('#NUM!')
  }
  const size = Math.trunc(sizeRaw.value)
  const t = studentTInv(1 - alpha.value / 2, size - 1)
  return finiteNumber(t * standardDev.value / Math.sqrt(size))
}
