/**
 * 多条件稀疏聚合的判据机：把 (条件区, 判据) 参数列表解析成可复用的匹配对，并枚举出需要逐格检查的候选坐标。
 *
 * 只被 `sparse-multi-criterion.ts` 用到 —— 那一批是 `FUNCTIONS` 注册表里同名
 * 函数的第二实现，约定与事故留痕见 `sparse-aggregations.ts` 文件头。与
 * `./evaluate` 的循环导入同样是有意的，同处有说明。
 */

import type {
  CellCoord,
  CellKey,
  CellRange,
  EvalContext,
  Expr,
  LambdaReferenceBinding,
  Value,
} from '../types'
import { cellKey } from '../refs'
import { makeCriterionMatcher } from './functions/stats'
import {
  ERR,
  canSparseIterate,
  evaluateFunctionArg,
  rangeCellCount,
  runtimeRefFromExpr,
  sparseValuesForRef,
} from './evaluate'
import {
  inverseRelativeCoord,
  sameRangeShape,
  valueAtRelativeCoord,
} from './sparse-range-alignment'

type RuntimeRef = LambdaReferenceBinding

export interface SparseCriterionPair {
  readonly ref: RuntimeRef
  readonly matches: (value: Value) => boolean
  readonly matchesBlank: boolean
}

export type SparseCriteriaResult =
  | { readonly kind: 'ok'; readonly pairs: SparseCriterionPair[]; readonly usesSparse: boolean }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'error'; readonly error: Value }

export function sparseCriteriaPairs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): SparseCriteriaResult {
  const pairs: SparseCriterionPair[] = []
  let usesSparse = false

  for (let i = 0; i < args.length; i += 2) {
    const ref = runtimeRefFromExpr(args[i], ctx)
    if (!ref.ok) return ref.error ? { kind: 'error', error: ref.error } : { kind: 'fallback' }
    if (ref.ref.materialized) return { kind: 'fallback' }

    const matcher = makeCriterionMatcher(evaluateFunctionArg(args[i + 1], ctx))
    if (!matcher.ok) return { kind: 'error', error: matcher.error }

    usesSparse = usesSparse || canSparseIterate(ref.ref)
    pairs.push({ ref: ref.ref, matches: matcher.matches, matchesBlank: matcher.matchesBlank })
  }

  return { kind: 'ok', pairs, usesSparse }
}

export function countIfsCandidateCoords(
  pairs: ReadonlyArray<SparseCriterionPair>,
  ctx: EvalContext,
): {
  readonly ok: true;
  readonly coords: ReadonlyArray<CellCoord>;
  readonly implicitCount: number
} | {
  readonly ok: false
  readonly error: Value
} {
  const base = pairs[0].ref.range
  const nonBlankDriver = pairs.find((pair) => !pair.matchesBlank)
  if (nonBlankDriver) {
    const sparse = sparseValuesForRef(nonBlankDriver.ref, ctx)
    if (!sparse.ok) return sparse
    const coords = new Map<CellKey, CellCoord>()
    for (const { coord, value } of sparse.values) {
      if (!nonBlankDriver.matches(value)) continue
      const baseCoord = inverseRelativeCoord(base, nonBlankDriver.ref.range, coord)
      if (baseCoord) coords.set(cellKey(baseCoord), baseCoord)
    }
    return { ok: true, coords: [...coords.values()], implicitCount: 0 }
  }

  const candidates = new Map<CellKey, CellCoord>()
  for (const pair of pairs) {
    const sparse = sparseValuesForRef(pair.ref, ctx)
    if (!sparse.ok) return sparse
    for (const { coord } of sparse.values) {
      const baseCoord = inverseRelativeCoord(base, pair.ref.range, coord)
      if (baseCoord) candidates.set(cellKey(baseCoord), baseCoord)
    }
  }

  const implicitCount = rangeCellCount(base) - candidates.size
  return { ok: true, coords: [...candidates.values()], implicitCount }
}

export function sumIfsCandidateCoords(
  pairs: ReadonlyArray<SparseCriterionPair>,
  sumRef: RuntimeRef,
  ctx: EvalContext,
): { readonly ok: true; readonly coords: ReadonlyArray<CellCoord> } | {
  readonly ok: false
  readonly error: Value
} {
  const base = pairs[0].ref.range
  const nonBlankDriver = pairs.find((pair) => !pair.matchesBlank)
  if (nonBlankDriver) {
    const sparse = sparseValuesForRef(nonBlankDriver.ref, ctx)
    if (!sparse.ok) return sparse
    const coords = new Map<CellKey, CellCoord>()
    for (const { coord, value } of sparse.values) {
      if (!nonBlankDriver.matches(value)) continue
      const baseCoord = inverseRelativeCoord(base, nonBlankDriver.ref.range, coord)
      if (baseCoord) coords.set(cellKey(baseCoord), baseCoord)
    }
    return { ok: true, coords: [...coords.values()] }
  }

  const candidates = new Map<CellKey, CellCoord>()
  for (const pair of pairs) {
    const sparse = sparseValuesForRef(pair.ref, ctx)
    if (!sparse.ok) return sparse
    for (const { coord } of sparse.values) {
      const baseCoord = inverseRelativeCoord(base, pair.ref.range, coord)
      if (baseCoord) candidates.set(cellKey(baseCoord), baseCoord)
    }
  }
  const sumSparse = sparseValuesForRef(sumRef, ctx)
  if (!sumSparse.ok) return sumSparse
  for (const { coord } of sumSparse.values) {
    const baseCoord = inverseRelativeCoord(base, sumRef.range, coord)
    if (baseCoord) candidates.set(cellKey(baseCoord), baseCoord)
  }
  return { ok: true, coords: [...candidates.values()] }
}

export function countMatchingCriteria(
  candidates: { readonly coords: ReadonlyArray<CellCoord>; readonly implicitCount: number },
  pairs: ReadonlyArray<SparseCriterionPair>,
  ctx: EvalContext,
): Value {
  let count = candidates.implicitCount
  for (const coord of candidates.coords) {
    if (matchesAllCriteria(coord, pairs, ctx)) count += 1
  }
  return { kind: 'number', value: count }
}

/**
 * 条件区里的错误格不短路：判定全交给 `pair.matches`（`makeCriterionMatcher`）
 * —— 错误格按**显示文本**参与比较，所以 `"#N/A"` 命中它、`">3"` 不命中它，
 * 与 COUNTIF / SUMIF 同一口径。值区那一档由各调用方在命中之后自行传播。
 *
 * 与「criteria 实参**本身**求值成错误」是两回事：那一档在 `sparseCriteriaPairs`
 * 里由 `makeCriterionMatcher` 返回 `ok: false` 直接传播，走不到这里。
 */
export function matchesAllCriteria(
  coord: CellCoord,
  pairs: ReadonlyArray<SparseCriterionPair>,
  ctx: EvalContext,
): boolean {
  const base = pairs[0].ref.range
  for (const pair of pairs) {
    if (!pair.matches(valueAtRelativeCoord(base, pair.ref, coord, ctx))) return false
  }
  return true
}

export function validateCriteriaShapes(
  pairs: ReadonlyArray<SparseCriterionPair>,
  expected?: CellRange,
): Value | undefined {
  const base = expected ?? pairs[0]?.ref.range
  if (!base) return ERR('#VALUE!')
  for (const pair of pairs) {
    if (!sameRangeShape(base, pair.ref.range)) return ERR('#VALUE!')
  }
  return undefined
}
