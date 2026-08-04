import type { FunctionImpl } from '../../../types'
import { ERR_VAL, finiteNumber, numberArg, booleanArg } from './numeric'
import { probability, standardNormalInv } from './normal-distribution'
import {
  chiSquareCdf,
  chiSquarePdf,
  fCdf,
  fPdf,
  integerValue,
  inversePositiveCdf,
  inversePositiveCdfNewton,
} from './distribution-primitives'
import { regularizedGammaQ } from './special-functions'
import { studentTCdf, studentTInv, studentTPdf } from './student-distribution'

export const CHISQ_DIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  const cumulative = booleanArg(args[2])
  if (!cumulative.ok) return cumulative.err
  if (x.value < 0 || df.value <= 0) return ERR_VAL('#NUM!')
  return probability(
    cumulative.value ? chiSquareCdf(x.value, df.value) : chiSquarePdf(x.value, df.value),
  )
}

export const CHISQ_DIST_RT: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (x.value < 0 || df.value <= 0) return ERR_VAL('#NUM!')
  return probability(regularizedGammaQ(df.value / 2, x.value / 2))
}

export const CHISQ_INV: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (p.value < 0 || p.value >= 1 || df.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(inversePositiveCdf(p.value, (x) => chiSquareCdf(x, df.value)))
}

export const CHISQ_INV_RT: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (p.value <= 0 || p.value > 1 || df.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(inversePositiveCdf(1 - p.value, (x) => chiSquareCdf(x, df.value)))
}

export const F_DIST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df1 = numberArg(args[1])
  if (!df1.ok) return df1.err
  const df2 = numberArg(args[2])
  if (!df2.ok) return df2.err
  const cumulative = booleanArg(args[3])
  if (!cumulative.ok) return cumulative.err
  if (x.value < 0 || df1.value <= 0 || df2.value <= 0) return ERR_VAL('#NUM!')
  return probability(
    cumulative.value ? fCdf(x.value, df1.value, df2.value) : fPdf(x.value, df1.value, df2.value),
  )
}

export const F_DIST_RT: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df1 = numberArg(args[1])
  if (!df1.ok) return df1.err
  const df2 = numberArg(args[2])
  if (!df2.ok) return df2.err
  if (x.value < 0 || df1.value <= 0 || df2.value <= 0) return ERR_VAL('#NUM!')
  return probability(1 - fCdf(x.value, df1.value, df2.value))
}

/**
 * Wilson-Hilferty seed for F.INV: maps p through the standard normal then
 * builds an approximation good enough for Newton-Raphson to converge in a
 * handful of iterations.
 */
function fInvWilsonHilfertySeed(p: number, df1: number, df2: number): number {
  const z = standardNormalInv(Math.min(Math.max(p, 1e-12), 1 - 1e-12))
  const a = 2 / (9 * df1)
  const b = 2 / (9 * df2)
  const num = 1 - b - z * Math.sqrt(b + a - a * b - (a + b) * z * z / 3)
  const den = 1 - a - z * Math.sqrt(a)
  // Approximation can produce non-positive numerator at extreme tails; clamp.
  const ratio = num / den
  const guess = ratio > 0 ? ratio ** 3 : 1
  return Number.isFinite(guess) && guess > 0 ? guess : 1
}

export const F_INV: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df1 = numberArg(args[1])
  if (!df1.ok) return df1.err
  const df2 = numberArg(args[2])
  if (!df2.ok) return df2.err
  if (p.value < 0 || p.value >= 1 || df1.value <= 0 || df2.value <= 0) return ERR_VAL('#NUM!')
  const seed = fInvWilsonHilfertySeed(p.value, df1.value, df2.value)
  return finiteNumber(
    inversePositiveCdfNewton(
      p.value,
      seed,
      (x) => fCdf(x, df1.value, df2.value),
      (x) => fPdf(x, df1.value, df2.value),
    ),
  )
}

export const F_INV_RT: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df1 = numberArg(args[1])
  if (!df1.ok) return df1.err
  const df2 = numberArg(args[2])
  if (!df2.ok) return df2.err
  if (p.value <= 0 || p.value > 1 || df1.value <= 0 || df2.value <= 0) return ERR_VAL('#NUM!')
  const q = 1 - p.value
  const seed = fInvWilsonHilfertySeed(q, df1.value, df2.value)
  return finiteNumber(
    inversePositiveCdfNewton(
      q,
      seed,
      (x) => fCdf(x, df1.value, df2.value),
      (x) => fPdf(x, df1.value, df2.value),
    ),
  )
}

export const T_DIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  const cumulative = booleanArg(args[2])
  if (!cumulative.ok) return cumulative.err
  if (df.value <= 0) return ERR_VAL('#NUM!')
  return probability(
    cumulative.value ? studentTCdf(x.value, df.value) : studentTPdf(x.value, df.value),
  )
}

export const T_DIST_RT: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (x.value < 0 || df.value <= 0) return ERR_VAL('#NUM!')
  return probability(1 - studentTCdf(x.value, df.value))
}

export const T_DIST_2T: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (x.value < 0 || df.value <= 0) return ERR_VAL('#NUM!')
  return probability(2 * (1 - studentTCdf(x.value, df.value)))
}

export const T_INV: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (p.value <= 0 || p.value >= 1 || df.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(studentTInv(p.value, df.value))
}

export const T_INV_2T: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const p = numberArg(args[0])
  if (!p.ok) return p.err
  const df = numberArg(args[1])
  if (!df.ok) return df.err
  if (p.value <= 0 || p.value > 1 || df.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber(studentTInv(1 - p.value / 2, df.value))
}

export const TDIST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = numberArg(args[0])
  if (!x.ok) return x.err
  const dfRaw = numberArg(args[1])
  if (!dfRaw.ok) return dfRaw.err
  const tailsRaw = numberArg(args[2])
  if (!tailsRaw.ok) return tailsRaw.err
  const tails = integerValue(tailsRaw.value)
  const df = Math.trunc(dfRaw.value)
  if (x.value < 0 || df < 1 || tails === undefined || (tails !== 1 && tails !== 2)) return ERR_VAL('#NUM!')
  const upperTail = 1 - studentTCdf(x.value, df)
  return probability(tails === 1 ? upperTail : 2 * upperTail)
}
