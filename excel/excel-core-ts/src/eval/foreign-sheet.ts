/**
 * 在另一张表的快照上求值。
 *
 * 职责：给一个 `ref` / `range` 表达式配一个绑到**外表** `cells` 的 shim
 * `EvalContext`，在那上面把它算成值。
 *
 * shim 沿用调用方的 `currentlyEvaluating`，所以跨表环照样检得出来；键按表名
 * 分了命名空间，`Sheet1!A1` 与 `Sheet2!A1` 不会撞。
 *
 * 求值器是**参数**传进来的，不是 import 的：反向 import `evaluate.ts` 会成环。
 */
import type { Cell, CellKey, EvalContext, Expr, Value } from '../types'
import { BLANK } from '../types'
import { cellKey, iterateRange, parseRange, RangeTooLargeError } from '../refs'
import { anchorScalar, NO_SPILL_ANCHORS, projectedValueAt } from './spill-projection'
import type { SpillProjectionRun } from './spill-projection-run'
import { ERR } from './error-value'
import { cellCoordFromKey, parseRefToKey } from './cell-address'
import { MATERIALIZED_RANGE_CELL_CAP, rangeHasHole } from './runtime-ref'
import { outOfBandSpillRun, refLookupGeneric } from './cell-read'
import { evaluateCellTrampolined, type EvaluateExpr } from './trampoline'

/**
 * Evaluate `inner` (a `ref` or `range` expression) against a *foreign*
 * sheet's cell snapshot. We build a tiny shim EvalContext whose `cells`
 * points at the foreign Map, but keep the rest of `ctx` (cycle set,
 * resolveName, etc.) intact.
 *
 * The shim's `refLookup` re-uses `ctx.currentlyEvaluating` so circular
 * detection still works across sheets. Cross-sheet keys are namespaced
 * with the sheet name so `A1` on Sheet1 doesn't collide with `A1` on
 * Sheet2 in the cycle set.
 */
export function evaluateInForeignSheet(
  inner: Expr,
  parent: EvalContext,
  foreignCells: ReadonlyMap<CellKey, Cell>,
  sheetName: string | undefined,
  evaluate: EvaluateExpr,
): Value {
  const sheetIndex = sheetName === undefined ? undefined : parent.sheetIndexOf?.(sheetName)
  const shim: EvalContext = {
    cells: foreignCells,
    currentlyEvaluating: parent.currentlyEvaluating,
    refLookup: (a1) => refLookupGeneric(a1, foreignCells, shim, evaluate),
    rangeLookup: (start, end) =>
      rangeLookupTrampolined(start, end, foreignCells, shim, evaluate),
    crossSheetCells: parent.crossSheetCells,
    callCustom: parent.callCustom,
    resolveName: parent.resolveName,
    currentSheetName: sheetName,
    currentSheetIndex: sheetIndex,
    sheetCount: parent.sheetCount,
    sheetIndexOf: parent.sheetIndexOf,
    locale: parent.locale,
    onFormulaEvaluated: parent.onFormulaEvaluated,
  }
  if (inner.kind === 'ref') {
    const key = parseRefToKey(inner.a1)
    if (!key) return ERR('#REF!')
    // 跨表单格也走同一条规则：有条目读自己（数组不折叠 —— 调用方决定，因为
    // `Sheet2!A1#` 要整片），没条目问投影。
    if (!foreignCells.has(key)) {
      const coord = cellCoordFromKey(key)
      return (
        (coord ? foreignSpillRun(foreignCells, shim, evaluate).at(undefined, coord) : undefined) ??
        BLANK
      )
    }
    return evaluateCellTrampolined(key, foreignCells, shim, evaluate)
  }
  return evaluate(inner, shim)
}

function rangeLookupTrampolined(
  start: string,
  end: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value[][] {
  const range = parseRange(start, end)
  if (!range) return [[ERR('#REF!')]]
  const rowCount = range.rowEnd - range.rowStart + 1
  const colCount = range.colEnd - range.colStart + 1
  const totalCells = rowCount * colCount
  if (totalCells > MATERIALIZED_RANGE_CELL_CAP) {
    return [[ERR('#NUM!', rangeTooLargeMessage(rowCount, colCount, totalCells))]]
  }

  const spilled = rangeHasHole(range, cells)
    ? foreignSpillRun(cells, ctx, evaluate).scan(undefined, range)
    : NO_SPILL_ANCHORS
  const rows: Value[][] = new Array(rowCount)
  try {
    let rIdx = 0
    let buf: Value[] | null = null
    let lastRow = -1
    for (const coord of iterateRange(range)) {
      if (coord.row !== lastRow) {
        buf = new Array(colCount)
        rows[rIdx] = buf
        rIdx += 1
        lastRow = coord.row
      }
      const k = cellKey(coord)
      buf![coord.col - range.colStart] = cells.has(k)
        ? anchorScalar(evaluateCellTrampolined(k, cells, ctx, evaluate))
        : projectedValueAt(spilled, coord) ?? BLANK
    }
  } catch (err) {
    if (err instanceof RangeTooLargeError) {
      return [[ERR('#NUM!', err.message)]]
    }
    throw err
  }
  return rows
}

function rangeTooLargeMessage(rowCount: number, colCount: number, totalCells: number): string {
  return `range too large to materialize (${rowCount}x${colCount} = ${totalCells} cells; cap 100000)`
}

/**
 * 跨表路径的账本 —— 候选也走 trampoline。用递归求值器会把跨表深链重新压回 JS
 * 调用栈（`chain-eval` 的 `RangeError` 就是这么来的）。
 */
function foreignSpillRun(
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): SpillProjectionRun {
  return outOfBandSpillRun(cells, ctx, (key, target) =>
    evaluateCellTrampolined(key, target, ctx, evaluate),
  )
}
