/**
 * 多条件稀疏聚合：COUNTIFS / SUMIFS / AVERAGEIFS / MAXIFS / MINIFS 在「区域不物化」前提下的流式实现。
 *
 * 约定与事故留痕见 `sparse-aggregations.ts` 文件头：本文件里的函数是
 * `FUNCTIONS` 注册表里同名函数的第二实现，`evaluate` 会在派发到函数表之前把
 * 它们截走，改一边必须改另一边。与 `./evaluate` 的循环导入同样是有意的。
 */

import type { EvalContext, Expr, Value } from '../types'
import { toNumber } from './coerce'
import { ERR, canSparseIterate, runtimeRefFromExpr } from './evaluate'
import { averageTierNumber } from './functions/stats'
import { runtimeRefSheetError } from './runtime-ref-read'
import {
  countIfsCandidateCoords,
  countMatchingCriteria,
  matchesAllCriteria,
  sparseCriteriaPairs,
  sumIfsCandidateCoords,
  validateCriteriaShapes,
} from './sparse-criteria'
import { valueAtRelativeCoord } from './sparse-range-alignment'

export function evaluateSparseCountIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 2 || args.length % 2 !== 0) return undefined
  const criteria = sparseCriteriaPairs(args, ctx)
  if (criteria.kind === 'fallback') return undefined
  if (criteria.kind === 'error') return criteria.error
  if (!criteria.usesSparse) return undefined
  const shapeError = validateCriteriaShapes(criteria.pairs)
  if (shapeError) return shapeError

  const candidates = countIfsCandidateCoords(criteria.pairs, ctx)
  if (!candidates.ok) return candidates.error

  return countMatchingCriteria(candidates, criteria.pairs, ctx)
}

export function evaluateSparseSumIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 3 || args.length % 2 === 0) return undefined
  const sumRef = runtimeRefFromExpr(args[0], ctx)
  if (!sumRef.ok) return undefined
  const sumSheetError = runtimeRefSheetError(sumRef.ref, ctx)
  if (sumSheetError) return sumSheetError
  if (sumRef.ref.materialized) return undefined

  const criteria = sparseCriteriaPairs(args.slice(1), ctx)
  if (criteria.kind === 'fallback') return undefined
  if (criteria.kind === 'error') return criteria.error
  if (!criteria.usesSparse && !canSparseIterate(sumRef.ref)) return undefined
  const shapeError = validateCriteriaShapes(criteria.pairs, sumRef.ref.range)
  if (shapeError) return shapeError

  const candidates = sumIfsCandidateCoords(criteria.pairs, sumRef.ref, ctx)
  if (!candidates.ok) return candidates.error
  const base = criteria.pairs[0].ref.range

  let total = 0
  for (const coord of candidates.coords) {
    if (!matchesAllCriteria(coord, criteria.pairs, ctx)) continue
    const target = valueAtRelativeCoord(base, sumRef.ref, coord, ctx)
    if (target.kind === 'error') return target
    const n = toNumber(target)
    if (n.ok) total += n.value
  }
  return { kind: 'number', value: total }
}

export function evaluateSparseAverageIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 3 || args.length % 2 === 0) return undefined
  const averageRef = runtimeRefFromExpr(args[0], ctx)
  if (!averageRef.ok) return undefined
  const averageSheetError = runtimeRefSheetError(averageRef.ref, ctx)
  if (averageSheetError) return averageSheetError
  if (averageRef.ref.materialized) return undefined

  const criteria = sparseCriteriaPairs(args.slice(1), ctx)
  if (criteria.kind === 'fallback') return undefined
  if (criteria.kind === 'error') return criteria.error
  if (!criteria.usesSparse && !canSparseIterate(averageRef.ref)) return undefined
  const shapeError = validateCriteriaShapes(criteria.pairs, averageRef.ref.range)
  if (shapeError) return shapeError

  const candidates = sumIfsCandidateCoords(criteria.pairs, averageRef.ref, ctx)
  if (!candidates.ok) return candidates.error
  const base = criteria.pairs[0].ref.range

  let total = 0
  let count = 0
  for (const coord of candidates.coords) {
    if (!matchesAllCriteria(coord, criteria.pairs, ctx)) continue
    const target = valueAtRelativeCoord(base, averageRef.ref, coord, ctx)
    if (target.kind === 'error') return target
    // 分母只数真正的数字（`averageTierNumber`），与物化孪生
    // `FUNCTIONS.AVERAGEIFS` 同一份。SUMIFS 那档仍是 `toNumber`。
    const n = averageTierNumber(target)
    if (n !== undefined) {
      total += n
      count += 1
    }
  }
  return count === 0 ? ERR('#DIV/0!') : { kind: 'number', value: total / count }
}

export function evaluateSparseMinMaxIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  kind: 'min' | 'max',
): Value | undefined {
  if (args.length < 3 || args.length % 2 === 0) return undefined
  const targetRef = runtimeRefFromExpr(args[0], ctx)
  if (!targetRef.ok) return undefined
  const targetSheetError = runtimeRefSheetError(targetRef.ref, ctx)
  if (targetSheetError) return targetSheetError
  if (targetRef.ref.materialized) return undefined

  const criteria = sparseCriteriaPairs(args.slice(1), ctx)
  if (criteria.kind === 'fallback') return undefined
  if (criteria.kind === 'error') return criteria.error
  if (!criteria.usesSparse && !canSparseIterate(targetRef.ref)) return undefined
  const shapeError = validateCriteriaShapes(criteria.pairs, targetRef.ref.range)
  if (shapeError) return shapeError

  const candidates = sumIfsCandidateCoords(criteria.pairs, targetRef.ref, ctx)
  if (!candidates.ok) return candidates.error
  const base = criteria.pairs[0].ref.range

  let seen = false
  let best = kind === 'min' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  for (const coord of candidates.coords) {
    if (!matchesAllCriteria(coord, criteria.pairs, ctx)) continue
    const target = valueAtRelativeCoord(base, targetRef.ref, coord, ctx)
    if (target.kind === 'error') return target
    if (target.kind !== 'number') continue
    best = kind === 'min' ? Math.min(best, target.value) : Math.max(best, target.value)
    seen = true
  }
  return { kind: 'number', value: seen ? best : 0 }
}
