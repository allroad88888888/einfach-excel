import type { FunctionImpl, Value } from '../../../types'
import { toNumber } from '../../coerce'
import { ERR_VAL, NUM, collectNumbers, ctxStub, welfordM2 } from './numeric'

export const MEDIAN: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  const nums = r.values.slice().sort((a, b) => a - b)
  if (nums.length === 0) return ERR_VAL('#NUM!')
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2 === 1) return NUM(nums[mid])
  return NUM((nums[mid - 1] + nums[mid]) / 2)
}

/** MODE.SNGL — first most-frequent number, or #N/A if all unique. */
export const MODE: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length < 2) return ERR_VAL('#N/A')
  const counts = new Map<number, number>()
  // Preserve insertion order so ties resolve to first-seen.
  for (const n of r.values) counts.set(n, (counts.get(n) ?? 0) + 1)
  let best: number | undefined
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount) {
      bestCount = c
      best = n
    }
  }
  if (best === undefined || bestCount < 2) return ERR_VAL('#N/A')
  return NUM(best)
}

/** MODE.MULT — column array of every value tied for the highest frequency. */
export const MODE_MULT: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length < 2) return ERR_VAL('#N/A')
  const counts = new Map<number, number>()
  for (const n of r.values) counts.set(n, (counts.get(n) ?? 0) + 1)
  const maxCount = Math.max(...counts.values())
  if (maxCount < 2) return ERR_VAL('#N/A')
  const seen = new Set<number>()
  const rows: Value[][] = []
  for (const n of r.values) {
    if (counts.get(n) === maxCount && !seen.has(n)) {
      seen.add(n)
      rows.push([NUM(n)])
    }
  }
  return { kind: 'array', value: rows }
}

/** STDEV — sample standard deviation (Bessel correction n-1). Welford's algorithm. */
export const STDEV: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length < 2) return ERR_VAL('#DIV/0!')
  const { n, M2 } = welfordM2(r.values)
  return NUM(Math.sqrt(M2 / (n - 1)))
}

/** STDEVP — population standard deviation (divide by n). Welford's algorithm. */
export const STDEVP: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#DIV/0!')
  const { n, M2 } = welfordM2(r.values)
  return NUM(Math.sqrt(M2 / n))
}

/** VAR — sample variance. Welford's algorithm. */
export const VAR: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length < 2) return ERR_VAL('#DIV/0!')
  const { n, M2 } = welfordM2(r.values)
  return NUM(M2 / (n - 1))
}

/** VARP — population variance. Welford's algorithm. */
export const VARP: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#DIV/0!')
  const { n, M2 } = welfordM2(r.values)
  return NUM(M2 / n)
}

/** LARGE(array, k) — k-th largest. */
export const LARGE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const kArg = args[1]
  if (kArg.kind === 'error') return kArg
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  const kc = toNumber(kArg)
  if (!kc.ok) return kc.error
  const k = Math.trunc(kc.value)
  if (k < 1 || k > r.values.length) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => b - a)
  return NUM(sorted[k - 1])
}

/** SMALL(array, k) — k-th smallest. */
export const SMALL: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const kArg = args[1]
  if (kArg.kind === 'error') return kArg
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  const kc = toNumber(kArg)
  if (!kc.ok) return kc.error
  const k = Math.trunc(kc.value)
  if (k < 1 || k > r.values.length) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => a - b)
  return NUM(sorted[k - 1])
}

/**
 * PERCENTILE.INC (a.k.a. PERCENTILE) — linear interpolation, k in [0,1].
 * The "INC" variant includes the endpoints; this is the function Excel
 * exposes under the bare name `PERCENTILE`.
 */
export const PERCENTILE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  if (args[1].kind === 'error') return args[1]
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#NUM!')
  const kc = toNumber(args[1])
  if (!kc.ok) return kc.error
  const k = kc.value
  if (k < 0 || k > 1) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => a - b)
  const pos = k * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return NUM(sorted[lo])
  return NUM(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo))
}

/** PERCENTILE.EXC(array, k) — exclusive interpolation, k strictly in (0, 1). */
export const PERCENTILE_EXC: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  if (args[1].kind === 'error') return args[1]
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#NUM!')
  const kc = toNumber(args[1])
  if (!kc.ok) return kc.error
  const k = kc.value
  if (k <= 0 || k >= 1) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => a - b)
  const pos = k * (sorted.length + 1)
  if (pos < 1 || pos > sorted.length) return ERR_VAL('#NUM!')
  const zeroBased = pos - 1
  const lo = Math.floor(zeroBased)
  const hi = Math.ceil(zeroBased)
  if (lo === hi) return NUM(sorted[lo])
  return NUM(sorted[lo] + (sorted[hi] - sorted[lo]) * (zeroBased - lo))
}

/** QUARTILE(array, quart) — quart in 0..4, maps to k = quart/4. */
export const QUARTILE: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  if (args[1].kind === 'error') return args[1]
  const qc = toNumber(args[1])
  if (!qc.ok) return qc.error
  const q = Math.trunc(qc.value)
  if (q < 0 || q > 4) return ERR_VAL('#NUM!')
  return PERCENTILE([args[0], { kind: 'number', value: q / 4 }], ctxStub)
}

/** QUARTILE.EXC(array, quart) — quart in 1..3, maps to PERCENTILE.EXC. */
export const QUARTILE_EXC: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  if (args[1].kind === 'error') return args[1]
  const qc = toNumber(args[1])
  if (!qc.ok) return qc.error
  const q = Math.trunc(qc.value)
  if (q !== qc.value || q < 1 || q > 3) return ERR_VAL('#NUM!')
  return PERCENTILE_EXC([args[0], { kind: 'number', value: q / 4 }], ctxStub)
}

/** RANK(value, ref, [order=0]) — order=0 descending (default), 1 ascending. */
export const RANK: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3) return ERR_VAL('#VALUE!')
  if (args[0].kind === 'error') return args[0]
  const vc = toNumber(args[0])
  if (!vc.ok) return vc.error
  const r = collectNumbers([args[1]])
  if (!r.ok) return r.err
  let descending = true
  if (args.length === 3) {
    if (args[2].kind === 'error') return args[2]
    const oc = toNumber(args[2])
    if (!oc.ok) return oc.error
    descending = oc.value === 0
  }
  const arr = r.values
  if (!arr.includes(vc.value)) return ERR_VAL('#N/A')
  // Standard competition ranking: 1-based.
  let rank = 1
  for (const n of arr) {
    if (descending ? n > vc.value : n < vc.value) rank++
  }
  return NUM(rank)
}

/** RANK.AVG(value, ref, [order=0]) — tied ranks average their occupied positions. */
export const RANK_AVG: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3) return ERR_VAL('#VALUE!')
  if (args[0].kind === 'error') return args[0]
  const vc = toNumber(args[0])
  if (!vc.ok) return vc.error
  const r = collectNumbers([args[1]])
  if (!r.ok) return r.err
  let descending = true
  if (args.length === 3) {
    if (args[2].kind === 'error') return args[2]
    const oc = toNumber(args[2])
    if (!oc.ok) return oc.error
    descending = oc.value === 0
  }
  const arr = r.values
  if (!arr.includes(vc.value)) return ERR_VAL('#N/A')
  let better = 0
  let equal = 0
  for (const n of arr) {
    if (n === vc.value) {
      equal++
    } else if (descending ? n > vc.value : n < vc.value) {
      better++
    }
  }
  return NUM(better + (equal + 1) / 2)
}
