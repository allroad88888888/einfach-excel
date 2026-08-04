import type { FunctionImpl, Value } from '../../../types'
import { toNumber } from '../../coerce'
import {
  ERR_VAL,
  NUM,
  collectNumbers,
  collectNumbersA,
  finiteNumber,
  meanOf,
  sumSquaredDeviations,
  welfordM2,
} from './numeric'

/** AVERAGEA — like AVERAGE but text counts as 0, booleans count as 0/1. */
export const AVERAGEA: FunctionImpl = (args) => {
  if (args.length === 0) return ERR_VAL('#DIV/0!')
  let total = 0
  let count = 0
  for (const arg of args) {
    if (arg.kind === 'error') return arg
    if (arg.kind === 'array') {
      for (const row of arg.value) {
        for (const cell of row) {
          if (cell.kind === 'error') return cell
          if (cell.kind === 'blank') continue
          if (cell.kind === 'number') {
            total += cell.value
            count++
          } else if (cell.kind === 'boolean') {
            total += cell.value ? 1 : 0
            count++
          } else if (cell.kind === 'string') {
            // text counts as 0 in AVERAGEA
            count++
          }
        }
      }
    } else if (arg.kind === 'blank') {
      // skip
    } else if (arg.kind === 'number') {
      total += arg.value
      count++
    } else if (arg.kind === 'boolean') {
      total += arg.value ? 1 : 0
      count++
    } else if (arg.kind === 'string') {
      // scalar string: must be numeric in AVERAGEA; else #VALUE!
      const n = toNumber(arg)
      if (!n.ok) return n.error
      total += n.value
      count++
    }
  }
  if (count === 0) return ERR_VAL('#DIV/0!')
  return NUM(total / count)
}

/** AVEDEV — average absolute deviation from the mean. */
export const AVEDEV: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#DIV/0!')
  const mean = meanOf(r.values)
  return finiteNumber(
    r.values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / r.values.length,
  )
}

/** DEVSQ — sum of squared deviations from the mean. */
export const DEVSQ: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return NUM(0)
  return finiteNumber(sumSquaredDeviations(r.values, meanOf(r.values)))
}

/** MAXA / MINA — text and FALSE count as 0, TRUE counts as 1, blanks skip. */
export const MAXA: FunctionImpl = (args) => {
  const r = collectNumbersA(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return NUM(0)
  return finiteNumber(
    r.values.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY),
  )
}

export const MINA: FunctionImpl = (args) => {
  const r = collectNumbersA(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return NUM(0)
  return finiteNumber(
    r.values.reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY),
  )
}

function varianceA(args: ReadonlyArray<Value>, sample: boolean, sqrt: boolean): Value {
  const r = collectNumbersA(args)
  if (!r.ok) return r.err
  const n = r.values.length
  if ((sample && n < 2) || (!sample && n < 1)) return ERR_VAL('#DIV/0!')
  // Welford's online algorithm — see welfordM2 for rationale.
  const { M2 } = welfordM2(r.values)
  const variance = M2 / (sample ? n - 1 : n)
  return finiteNumber(sqrt ? Math.sqrt(variance) : variance)
}

export const STDEVA: FunctionImpl = (args) => varianceA(args, true, true)
export const STDEVPA: FunctionImpl = (args) => varianceA(args, false, true)
export const VARA: FunctionImpl = (args) => varianceA(args, true, false)
export const VARPA: FunctionImpl = (args) => varianceA(args, false, false)

/** STANDARDIZE(x, mean, standard_dev). */
export const STANDARDIZE: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const x = toNumber(args[0])
  if (!x.ok) return x.error
  const mean = toNumber(args[1])
  if (!mean.ok) return mean.error
  const standardDev = toNumber(args[2])
  if (!standardDev.ok) return standardDev.error
  if (standardDev.value <= 0) return ERR_VAL('#NUM!')
  return finiteNumber((x.value - mean.value) / standardDev.value)
}

/** GEOMEAN — geometric mean of strictly-positive inputs. */
export const GEOMEAN: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#NUM!')
  let logSum = 0
  for (const value of r.values) {
    if (value <= 0) return ERR_VAL('#NUM!')
    logSum += Math.log(value)
  }
  return finiteNumber(Math.exp(logSum / r.values.length))
}

/** HARMEAN — harmonic mean of strictly-positive inputs. */
export const HARMEAN: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#NUM!')
  let invSum = 0
  for (const value of r.values) {
    if (value <= 0) return ERR_VAL('#NUM!')
    invSum += 1 / value
  }
  return finiteNumber(r.values.length / invSum)
}

/** TRIMMEAN(array, percent) — trim equally from both tails before averaging. */
export const TRIMMEAN: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const percent = toNumber(args[1])
  if (!percent.ok) return percent.error
  if (percent.value < 0 || percent.value >= 1) return ERR_VAL('#NUM!')
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  const n = r.values.length
  if (n === 0) return ERR_VAL('#DIV/0!')
  const trimEach = Math.floor(Math.floor(n * percent.value) / 2)
  if (trimEach * 2 >= n) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => a - b)
  const kept = sorted.slice(trimEach, n - trimEach)
  return finiteNumber(meanOf(kept))
}

export const FISHER: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const x = toNumber(args[0])
  if (!x.ok) return x.error
  if (x.value <= -1 || x.value >= 1) return ERR_VAL('#NUM!')
  return finiteNumber(0.5 * Math.log((1 + x.value) / (1 - x.value)))
}

export const FISHERINV: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR_VAL('#VALUE!')
  const y = toNumber(args[0])
  if (!y.ok) return y.error
  return finiteNumber(Math.tanh(y.value))
}
