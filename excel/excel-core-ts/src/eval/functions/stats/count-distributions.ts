import type { FunctionImpl } from '../../../types'
import { ERR_VAL, ctxStub, numberArg, booleanArg } from './numeric'
import { probability } from './normal-distribution'
import { hypergeomCdf, hypergeomPmf, integerValue, negbinomCdf, negbinomPmf } from './distribution-primitives'

export const HYPGEOM_DIST: FunctionImpl = (args) => {
  if (args.length !== 5) return ERR_VAL('#VALUE!')
  const sampleS = numberArg(args[0])
  if (!sampleS.ok) return sampleS.err
  const numSample = numberArg(args[1])
  if (!numSample.ok) return numSample.err
  const popS = numberArg(args[2])
  if (!popS.ok) return popS.err
  const numPop = numberArg(args[3])
  if (!numPop.ok) return numPop.err
  const cumulative = booleanArg(args[4])
  if (!cumulative.ok) return cumulative.err
  const sampleSI = integerValue(sampleS.value)
  const numSampleI = integerValue(numSample.value)
  const popSI = integerValue(popS.value)
  const numPopI = integerValue(numPop.value)
  if (
    sampleSI === undefined ||
    numSampleI === undefined ||
    popSI === undefined ||
    numPopI === undefined ||
    sampleSI < 0 ||
    numSampleI < 0 ||
    popSI < 0 ||
    numPopI < 0 ||
    popSI > numPopI ||
    numSampleI > numPopI ||
    sampleSI > numSampleI ||
    sampleSI > popSI
  ) {
    return ERR_VAL('#NUM!')
  }
  return probability(
    cumulative.value
      ? hypergeomCdf(sampleSI, numSampleI, popSI, numPopI)
      : hypergeomPmf(sampleSI, numSampleI, popSI, numPopI),
  )
}

export const HYPGEOMDIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  return HYPGEOM_DIST([...args, { kind: 'boolean', value: false }], ctxStub)
}

export const NEGBINOM_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const numF = numberArg(args[0])
  if (!numF.ok) return numF.err
  const numS = numberArg(args[1])
  if (!numS.ok) return numS.err
  const p = numberArg(args[2])
  if (!p.ok) return p.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  const f = integerValue(numF.value)
  const s = integerValue(numS.value)
  if (f === undefined || s === undefined || f < 0 || s < 1 || p.value <= 0 || p.value > 1) {
    return ERR_VAL('#NUM!')
  }
  return probability(cumulative.value ? negbinomCdf(f, s, p.value) : negbinomPmf(f, s, p.value))
}

export const NEGBINOMDIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  return NEGBINOM_DIST([...args, { kind: 'boolean', value: false }], ctxStub)
}
