/**
 * 递归路径下「把一个地址读成值」。
 *
 * 职责：在一份 `cells` 快照里解析一个地址（或一片区域），公式格就地递归求值，
 * 用 `ctx.currentlyEvaluating` 挡住环。
 *
 * 这是**递归**那条路 —— 宿主自造 `EvalContext` 的直测、跨表 shim 的嵌套读走
 * 它。逐格入口（`sheet.ts`）走的是 `trampoline.ts` 的显式工作栈，两条路各自
 * 保留，原因见 `resolveCell` 的 Recursion note。
 *
 * 求值器是**参数**传进来的，不是 import 的：反向 import `evaluate.ts` 会成环。
 */
import type { Cell, CellKey, EvalContext, Value } from '../types'
import { BLANK } from '../types'
import { cellKey, iterateRange, parseRange, RangeTooLargeError } from '../refs'
import { anchorScalar } from './spill-projection'
import type { SpillAnchorSource } from './spill-projection'
import { createSpillProjectionRun, type SpillProjectionRun } from './spill-projection-run'
import { ERR } from './error-value'
import { spillRunOf, type SpillAwareContext } from './spill-aware-context'
import { cellCoordFromKey, parseRefToKey } from './cell-address'
import { tagFor } from './cycle-guard'
import type { EvaluateExpr } from './trampoline'

/**
 * Generic ref-lookup shared between the per-sheet ctx (workbook wires it)
 * and the cross-sheet shim. Pulled into evaluator-internal scope so cycle
 * detection lives in exactly one place.
 *
 * Returns `BLANK` when the cell does not exist (Excel behavior — an
 * unwritten cell reads as blank, not as `#REF!`).
 */
export function refLookupGeneric(
  a1: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const coord = parseRefToKey(a1)
  if (!coord) return ERR('#REF!')
  return resolveCell(coord, cells, ctx, evaluate)
}

/**
 * Generic range lookup. Returns a row-major 2-D `Value[][]`. Blank cells
 * stay blank rather than being omitted.
 *
 * For whole-row / whole-col ranges (`A:A`, `1:1`) the range expands to
 * the Excel max bounds via `parseRange` → could be ~1M rows. We guard
 * against materializing those with `RangeTooLargeError` and surface
 * `#NUM!`. Wave E will add a streaming iterator so SUM / AVERAGE can
 * still consume them without allocating the entire 2-D array.
 */
export function rangeLookupGeneric(
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
  // Bound materialization. `iterateRange` is uncapped (it's a lazy
  // generator), and `expandRange`'s `RangeTooLargeError` doesn't fire
  // when we walk via iterateRange. Materializing `A:XFD` (16M cells)
  // or `A:A` (1M cells) here would hang the worker. We surface `#NUM!`
  // with a hint instead — formulas that need to scan an entire column
  // must use COUNTIF / SUMIF (which iterate the existing cell map, not
  // the abstract range) for now.
  const totalCells = rowCount * colCount
  // Use the same 100k cap as expandRange (refs/ranges.ts EXPAND_MAX_CELLS).
  // Picked to match Go-To-Special's convention across the codebase.
  if (totalCells > 100_000) {
    return [[ERR('#NUM!', `range too large to materialize (${rowCount}x${colCount} = ${totalCells} cells; cap 100000)`)]]
  }
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
      buf![coord.col - range.colStart] = resolveCell(cellKey(coord), cells, ctx, evaluate)
    }
  } catch (err) {
    if (err instanceof RangeTooLargeError) {
      return [[ERR('#NUM!', err.message)]]
    }
    throw err
  }
  return rows
}

/**
 * Resolve a single CellKey within `cells`. Handles:
 *  - cell missing → BLANK
 *  - literal cell (no AST) → stored value
 *  - formula cell (with AST) → recursive `evaluate`, guarded against
 *    cycles via `ctx.currentlyEvaluating`.
 *
 * The cycle-set key is composite — `<mapTag>:<cellKey>` — so the same
 * `0:0` CellKey on different sheets doesn't false-positive.
 *
 * **Recursion note (Chain-eval bug):** prior to the trampoline introduced
 * in `evaluateCellTrampolined`, a 1000-deep dependency chain
 * (`A2=A1+1, A3=A2+1, …`) blew V8's ~1 MB call stack here, because every
 * `ref` lookup walked back through `evaluate → refLookupGeneric →
 * resolveCell → evaluate` on the JS stack. This recursive `resolveCell`
 * is preserved for cycle-detection compatibility and for the
 * cross-sheet shim's foreign-sheet entry path, but the per-cell entry
 * point in `sheet.ts` now goes through `evaluateCellTrampolined`, which
 * processes the same dependency graph using an explicit work stack
 * (Option B in the bug report).
 */
function resolveCell(
  key: CellKey,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const cell = cells.get(key)
  if (!cell) {
    // 自有条目缺席 → 问投影。递归路径（跨表 / 宿主自造 ctx）没有 trampoline 的
    // 账本，就地建一个：这条路是冷路径，不值得再加一层缓存。
    const coord = cellCoordFromKey(key)
    if (!coord) return BLANK
    const run = ctx.cells === cells ? spillRunOf(ctx) : undefined
    return (run ?? recursiveSpillRun(cells, ctx, evaluate)).at(undefined, coord) ?? BLANK
  }
  // 把地址读成值 = 折叠数组到左上角标量。整片只有 `A1#` 拿得到。
  return anchorScalar(resolveCellRaw(key, cells, ctx, evaluate))
}

/**
 * 递归路径的投影账本。每次查找现建一个（`unstable` 关掉备忘录），因为 `cells`
 * 与求值栈都由调用方的 `currentlyEvaluating` 决定，跨调用复用会读到过期形状。
 */
export function outOfBandSpillRun(
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluateAnchor: (key: CellKey, target: ReadonlyMap<CellKey, Cell>) => Value,
): SpillProjectionRun {
  return createSpillProjectionRun({
    cellsFor: (sheetName) => (sheetName === undefined ? cells : ctx.crossSheetCells(sheetName)),
    sourceFor: (target): SpillAnchorSource => ({
      arrayAt: (key, cell) => {
        if (cell.ast === undefined) {
          return cell.value.kind === 'array' ? cell.value.value : undefined
        }
        // 候选正在求值栈上：它在读我们，不能反过来向它索赔。
        if (ctx.currentlyEvaluating.has(`${tagFor(target)}:${key}`)) return undefined
        const value = evaluateAnchor(key, target)
        return value.kind === 'array' ? value.value : undefined
      },
      unstable: () => true,
    }),
  })
}

/** 递归路径（宿主自造 ctx / `resolveCell` 的嵌套读）的账本。 */
function recursiveSpillRun(
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): SpillProjectionRun {
  return outOfBandSpillRun(cells, ctx, (key, target) =>
    resolveCellRaw(key, target, ctx, evaluate),
  )
}

/** `resolveCell` 的不折叠版：锚点交回整片数组。 */
function resolveCellRaw(
  key: CellKey,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const tag = tagFor(cells)
  const guardKey: CellKey = `${tag}:${key}`
  if (ctx.currentlyEvaluating.has(guardKey)) {
    return ERR('#CIRCULAR!')
  }
  const cell = cells.get(key)
  if (!cell) return BLANK
  if (!cell.ast) return cell.value
  ctx.currentlyEvaluating.add(guardKey)
  try {
    // Use a sub-context bound to the same `cells` so nested ref lookups
    // go through the same snapshot (no recursion into the parent shim).
    const sub: SpillAwareContext = {
      cells,
      currentlyEvaluating: ctx.currentlyEvaluating,
      refLookup: (a1) => refLookupGeneric(a1, cells, sub, evaluate),
      refLookupRaw: (a1) => {
        const coord = parseRefToKey(a1)
        return coord ? resolveCellRaw(coord, cells, sub, evaluate) : ERR('#REF!')
      },
      rangeLookup: (start, end) => rangeLookupGeneric(start, end, cells, sub, evaluate),
      crossSheetCells: ctx.crossSheetCells,
      callCustom: ctx.callCustom,
      resolveName: ctx.resolveName,
      currentCell: cellCoordFromKey(key),
      currentSheetName: ctx.currentSheetName,
      currentSheetIndex: ctx.currentSheetIndex,
      sheetCount: ctx.sheetCount,
      sheetIndexOf: ctx.sheetIndexOf,
      locale: ctx.locale,
      onFormulaEvaluated: ctx.onFormulaEvaluated,
    }
    const value = evaluate(cell.ast, sub)
    // Lazy dep install (KEY_GRANULAR_INVALIDATION): this formula was
    // really evaluated — let the workbook record its reverse edges.
    ctx.onFormulaEvaluated?.(cells, key, cell.ast)
    return value
  } finally {
    ctx.currentlyEvaluating.delete(guardKey)
  }
}
