/**
 * 单条件稀疏聚合：COUNTIF / SUMIF / AVERAGEIF 在「区域不物化」前提下的流式实现。
 *
 * 约定与事故留痕见 `sparse-aggregations.ts` 文件头：本文件里的函数是
 * `FUNCTIONS` 注册表里同名函数的第二实现，`evaluate` 会在派发到函数表之前把
 * 它们截走，改一边必须改另一边。与 `./evaluate` 的循环导入同样是有意的。
 */

import type {
  CellCoord,
  CellKey,
  EvalContext,
  Expr,
  LambdaReferenceBinding,
  Value,
} from '../types'
import { cellKey } from '../refs'
import { averageTierNumber, makeCriterionMatcher } from './functions/stats'
import { toNumber } from './coerce'
import {
  ERR,
  canSparseIterate,
  evaluateFunctionArg,
  rangeCellCount,
  runtimeRefFromExpr,
  sparseValuesForRef,
  valueAtRuntimeCoord,
} from './evaluate'
import { runtimeRefSheetError } from './runtime-ref-read'
import { inverseRelativeCoord, relativeCoord } from './sparse-range-alignment'

type RuntimeRef = LambdaReferenceBinding

export function evaluateSparseCountIf(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length !== 2) return undefined

  // Multi-area first arg: COUNTIF((A:A,C:C), crit) = COUNTIF(A:A, crit) + COUNTIF(C:C, crit).
  if (args[0].kind === 'multiArea') {
    let total = 0
    for (const area of args[0].areas) {
      const sub = evaluateSparseCountIf([area, args[1]], ctx)
      if (sub === undefined) return undefined
      if (sub.kind === 'error') return sub
      if (sub.kind !== 'number') return undefined
      total += sub.value
    }
    return { kind: 'number', value: total }
  }

  const ref = runtimeRefFromExpr(args[0], ctx)
  if (!ref.ok || !canSparseIterate(ref.ref)) return undefined

  const criterion = evaluateFunctionArg(args[1], ctx)
  const matcher = makeCriterionMatcher(criterion)
  if (!matcher.ok) return matcher.error
  const sheetError = runtimeRefSheetError(ref.ref, ctx)
  if (sheetError) return sheetError

  const sparse = sparseValuesForRef(ref.ref, ctx)
  if (!sparse.ok) return sparse.error

  let count = matcher.matchesBlank ? rangeCellCount(ref.ref.range) - sparse.values.length : 0
  for (const { value } of sparse.values) {
    if (matcher.matches(value)) count += 1
  }
  return { kind: 'number', value: count }
}

export function evaluateSparseSumIf(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 2 || args.length > 3) return undefined

  // Multi-area check range: SUMIF((A:A,C:C), crit) = SUMIF(A:A, crit) + SUMIF(C:C, crit).
  // For 3-arg form, the sum-range may also be multi-area with matching shape.
  if (args[0].kind === 'multiArea') {
    const checkAreas = args[0].areas
    let sumAreas: ReadonlyArray<Expr> | undefined
    if (args.length === 3) {
      if (args[2].kind !== 'multiArea') return undefined
      if (args[2].areas.length !== checkAreas.length) return undefined
      sumAreas = args[2].areas
    }
    let total = 0
    for (let i = 0; i < checkAreas.length; i += 1) {
      const subArgs: Expr[] = [checkAreas[i], args[1]]
      if (sumAreas) subArgs.push(sumAreas[i])
      const sub = evaluateSparseSumIf(subArgs, ctx)
      if (sub === undefined) return undefined
      if (sub.kind === 'error') return sub
      if (sub.kind !== 'number') return undefined
      total += sub.value
    }
    return { kind: 'number', value: total }
  }

  const checkRef = runtimeRefFromExpr(args[0], ctx)
  if (!checkRef.ok || !canSparseIterate(checkRef.ref)) return undefined

  const criterion = evaluateFunctionArg(args[1], ctx)
  const matcher = makeCriterionMatcher(criterion)
  if (!matcher.ok) return matcher.error
  const checkSheetError = runtimeRefSheetError(checkRef.ref, ctx)
  if (checkSheetError) return checkSheetError

  const sumRef = args.length === 3 ? runtimeRefFromExpr(args[2], ctx) : checkRef
  if (!sumRef.ok) return undefined
  const sumSheetError = runtimeRefSheetError(sumRef.ref, ctx)
  if (sumSheetError) return sumSheetError
  if (sumRef.ref.materialized) return undefined

  const sparse = sparseValuesForRef(checkRef.ref, ctx)
  if (!sparse.ok) return sparse.error
  if (matcher.matchesBlank) {
    const sumSparse = sumRef === checkRef ? sparse : sparseValuesForRef(sumRef.ref, ctx)
    if (!sumSparse.ok) return sumSparse.error
    return sumBlankMatchedTargets(
      checkRef.ref,
      sumRef.ref,
      sparse.values,
      sumSparse.values,
      matcher.matches,
      ctx,
    )
  }

  let total = 0
  for (const { coord, value } of sparse.values) {
    if (!matcher.matches(value)) continue
    const targetCoord = relativeCoord(checkRef.ref.range, sumRef.ref.range, coord)
    if (!targetCoord) return ERR('#REF!')
    const target = valueAtRuntimeCoord(sumRef.ref.sheetName, targetCoord, ctx)
    if (target.kind === 'error') return target
    const n = toNumber(target)
    if (n.ok) total += n.value
  }
  return { kind: 'number', value: total }
}

function sumBlankMatchedTargets(
  checkRef: RuntimeRef,
  sumRef: RuntimeRef,
  checkValues: ReadonlyArray<{ readonly coord: CellCoord; readonly value: Value }>,
  sumValues: ReadonlyArray<{ readonly coord: CellCoord; readonly value: Value }>,
  matches: (value: Value) => boolean,
  ctx: EvalContext,
): Value {
  const candidates = new Map<CellKey, CellCoord>()
  for (const { coord } of checkValues) candidates.set(cellKey(coord), coord)
  for (const { coord } of sumValues) {
    const checkCoord = inverseRelativeCoord(checkRef.range, sumRef.range, coord)
    if (checkCoord) candidates.set(cellKey(checkCoord), checkCoord)
  }

  let total = 0
  for (const coord of candidates.values()) {
    const checkValue = valueAtRuntimeCoord(checkRef.sheetName, coord, ctx)
    // 条件区错误格不短路：判定全交给 `matches`（`makeCriterionMatcher`）——
    // 具体匹配上什么由 `matchesCriterion` 按「判据带不带通配符」分档。
    // 值区错误格在下面照旧传播。
    if (!matches(checkValue)) continue
    const targetCoord = relativeCoord(checkRef.range, sumRef.range, coord)
    if (!targetCoord) return ERR('#REF!')
    const target = valueAtRuntimeCoord(sumRef.sheetName, targetCoord, ctx)
    if (target.kind === 'error') return target
    const n = toNumber(target)
    if (n.ok) total += n.value
  }
  return { kind: 'number', value: total }
}

export function evaluateSparseAverageIf(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 2 || args.length > 3) return undefined
  const checkRef = runtimeRefFromExpr(args[0], ctx)
  if (!checkRef.ok) return undefined

  const averageRef = args.length === 3 ? runtimeRefFromExpr(args[2], ctx) : checkRef
  if (!averageRef.ok) return undefined
  const checkSheetError = runtimeRefSheetError(checkRef.ref, ctx)
  if (checkSheetError) return checkSheetError
  const averageSheetError = runtimeRefSheetError(averageRef.ref, ctx)
  if (averageSheetError) return averageSheetError
  if (checkRef.ref.materialized || averageRef.ref.materialized) return undefined
  if (
    !canSparseIterate(checkRef.ref) &&
    !canSparseIterate(averageRef.ref)
  ) {
    return undefined
  }
  // 这里曾有一条 `sameRangeShape → #VALUE!`。它不是 Excel 的规则：average_range
  // 只贡献左上角，行列数由条件区决定（见 `criteria-value-rect.ts`），下面的
  // `relativeCoord` 本来就是按这条规则换算的 —— 守卫只是把合法写法挡在门外，
  // 与 `evaluateSparseSumIf`（从来没有这条守卫）也不自洽。

  const criterion = evaluateFunctionArg(args[1], ctx)
  const matcher = makeCriterionMatcher(criterion)
  if (!matcher.ok) return matcher.error

  const sparse = sparseValuesForRef(checkRef.ref, ctx)
  if (!sparse.ok) return sparse.error
  if (matcher.matchesBlank) {
    const averageSparse =
      averageRef === checkRef ? sparse : sparseValuesForRef(averageRef.ref, ctx)
    if (!averageSparse.ok) return averageSparse.error
    return averageBlankMatchedTargets(
      checkRef.ref,
      averageRef.ref,
      sparse.values,
      averageSparse.values,
      matcher.matches,
      ctx,
    )
  }

  let total = 0
  let count = 0
  for (const { coord, value } of sparse.values) {
    // 条件区错误格不短路，判定全交给 `matcher.matches`（保持与
    // `evaluateSparseSumIf` 同形）；平均区错误格在下面照旧传播。
    if (!matcher.matches(value)) continue
    const targetCoord = relativeCoord(checkRef.ref.range, averageRef.ref.range, coord)
    if (!targetCoord) return ERR('#REF!')
    const target = valueAtRuntimeCoord(averageRef.ref.sheetName, targetCoord, ctx)
    if (target.kind === 'error') return target
    // 分母只数真正的数字 —— 与物化孪生 `FUNCTIONS.AVERAGEIF` 共用
    // `averageTierNumber`，不是 SUMIF 那档 `toNumber`（空格→0 会进分母）。
    const n = averageTierNumber(target)
    if (n !== undefined) {
      total += n
      count += 1
    }
  }
  return count === 0 ? ERR('#DIV/0!') : { kind: 'number', value: total / count }
}

function averageBlankMatchedTargets(
  checkRef: RuntimeRef,
  averageRef: RuntimeRef,
  checkValues: ReadonlyArray<{ readonly coord: CellCoord; readonly value: Value }>,
  averageValues: ReadonlyArray<{ readonly coord: CellCoord; readonly value: Value }>,
  matches: (value: Value) => boolean,
  ctx: EvalContext,
): Value {
  const candidates = new Map<CellKey, CellCoord>()
  for (const { coord } of checkValues) candidates.set(cellKey(coord), coord)
  for (const { coord } of averageValues) {
    const checkCoord = inverseRelativeCoord(checkRef.range, averageRef.range, coord)
    if (checkCoord) candidates.set(cellKey(checkCoord), checkCoord)
  }

  let total = 0
  let count = 0
  for (const coord of candidates.values()) {
    const checkValue = valueAtRuntimeCoord(checkRef.sheetName, coord, ctx)
    // 条件区错误格不短路，与 `sumBlankMatchedTargets` 同形。
    if (!matches(checkValue)) continue
    const targetCoord = relativeCoord(checkRef.range, averageRef.range, coord)
    if (!targetCoord) return ERR('#REF!')
    const target = valueAtRuntimeCoord(averageRef.sheetName, targetCoord, ctx)
    if (target.kind === 'error') return target
    // 同上：空格命中时贡献的是「什么都不贡献」，不是 0。
    const n = averageTierNumber(target)
    if (n !== undefined) {
      total += n
      count += 1
    }
  }
  return count === 0 ? ERR('#DIV/0!') : { kind: 'number', value: total / count }
}
