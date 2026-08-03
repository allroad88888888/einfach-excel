/**
 * 把运行期引用矩形读成值。
 *
 * 职责：给一个已经解析好的 `RuntimeRef`（或它里面的一个坐标），在当前快照上把它
 * 读出来 —— 单格折叠成左上角标量、区域物化成二维数组、整列 / 整行走稀疏遍历、
 * 没有自有条目的格子回落到溢出投影。
 *
 * 矩形怎么来的在 `runtime-ref-resolve.ts`，矩形的纯几何在 `runtime-ref.ts`。
 * 求值器是**参数**传进来的，不是 import 的：反向 import `evaluate.ts` 会成环。
 */
import type { Cell, CellCoord, CellKey, EvalContext, Value } from '../types'
import { BLANK } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW, cellKey, formatA1 } from '../refs'
import { anchorScalar, projectedCoordsIn } from './spill-projection'
import { ERR } from './error-value'
import { arrayResult } from './array-shape'
import { spillRunOf, type SpillAwareContext } from './spill-aware-context'
import { cellCoordFromKey } from './cell-address'
import { rangeContainsCoord, type RuntimeRef } from './runtime-ref'
import { NeedsDep } from './trampoline-ctx'
import type { EvaluateExpr } from './trampoline'
import { evaluateInForeignSheet } from './foreign-sheet'

export function evaluateRuntimeRef(
  ref: RuntimeRef,
  ctx: EvalContext,
  scalarTopLeft: boolean,
  evaluate: EvaluateExpr,
): Value {
  if (ref.materialized) {
    if (
      scalarTopLeft ||
      (ref.materialized.length === 1 && (ref.materialized[0]?.length ?? 0) === 1)
    ) {
      return ref.materialized[0]?.[0] ?? BLANK
    }
    return arrayResult(ref.materialized, 'range result')
  }
  const range = ref.range
  const start = formatA1({ row: range.rowStart, col: range.colStart })
  const isSingle = range.rowStart === range.rowEnd && range.colStart === range.colEnd
  if (isSingle || scalarTopLeft) {
    if (!ref.sheetName) return ctx.refLookup(start)
    const cells = ctx.crossSheetCells(ref.sheetName)
    if (!cells) return ERR('#REF!')
    // 跨表单格读成值：与本表同一条规则，锚点折叠成左上角标量。
    return anchorScalar(
      evaluateInForeignSheet(
        { kind: 'ref', a1: start, absCol: false, absRow: false },
        ctx,
        cells,
        ref.sheetName,
        evaluate,
      ),
    )
  }

  const end = formatA1({ row: range.rowEnd, col: range.colEnd })
  if (!ref.sheetName) {
    const rows = ctx.rangeLookup(start, end)
    if (rows.length === 0 || rows[0].length === 0) return ERR('#REF!')
    return arrayResult(rows, 'range result')
  }
  const cells = ctx.crossSheetCells(ref.sheetName)
  if (!cells) return ERR('#REF!')
  return evaluateInForeignSheet({ kind: 'range', start, end }, ctx, cells, ref.sheetName, evaluate)
}

export function sparseValuesForRef(
  ref: RuntimeRef,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
):
  | {
      readonly ok: true
      readonly values: ReadonlyArray<{ readonly coord: CellCoord; readonly value: Value }>
    }
  | {
      readonly ok: false
      readonly error: Value
    } {
  const cells = ref.sheetName ? ctx.crossSheetCells(ref.sheetName) : ctx.cells
  if (!cells) return { ok: false, error: ERR('#REF!') }

  const coords: CellCoord[] = []
  for (const key of cells.keys()) {
    const coord = cellCoordFromKey(key)
    if (coord && rangeContainsCoord(ref.range, coord)) coords.push(coord)
  }
  // 投影格在 `cells` 里没有条目，稀疏遍历看不见它们。补回来 —— 少了这一步，
  // 锚点被 `anchorScalar` 收成标量之后 `SUM(A:A)` 会从 6 掉成 1（A2/A3 没人报数）。
  // 这是「稀疏孪生」那一族最容易出事的一处：区间形式走物化路径、整列形式走这里，
  // 两条路必须给同一个答案。
  const projected = spillProjectedInRange(ref, ctx)
  for (const key of projected.keys()) {
    const coord = cellCoordFromKey(key)
    if (coord) coords.push(coord)
  }
  coords.sort((a, b) => a.row - b.row || a.col - b.col)

  // Per-cell resolution discipline (scale-suite S3/S4 finding,
  // 2026-06-12 — pre-fix, whole-column aggregates over N existing cells
  // were O(N² log N): every uncached cell's refLookup threw NeedsDep
  // under the trampoline shim, restarting this whole scan-and-sort once
  // per cell; SUM(A:A) measured 458 ms @ 1k, 1.83 s @ 2k, 7.3 s @ 4k,
  // ~hours @ 100k):
  //
  //  1. LITERAL cells resolve straight from storage (`coords` came from
  //     this very map) — O(1), semantics-preserving (refLookup returns
  //     exactly `cell.value` for them; see `valueAtRuntimeCoord`).
  //  2. FORMULA cells keep the refLookup path (trampoline evaluation,
  //     cycle detection, lazy dep install) — but their NeedsDep faults
  //     are ACCUMULATED and rethrown as ONE batch, mirroring the shim's
  //     `rangeLookup` batching, so a column dense with formula cells
  //     costs one retry of the calling formula, not one restart per
  //     cell. Under the recursive (non-shim) path refLookup never
  //     throws and the try/catch is inert.
  const missing: Array<{
    cells: ReadonlyMap<CellKey, Cell>
    key: CellKey
    guardKey: CellKey
  }> = []
  const values: Array<{ coord: CellCoord; value: Value }> = new Array(coords.length)
  for (let i = 0; i < coords.length; i += 1) {
    const coord = coords[i]
    const key = cellKey(coord)
    const cell = cells.get(key)
    if (cell && !cell.ast) {
      values[i] = { coord, value: anchorScalar(cell.value) }
      continue
    }
    if (!cell) {
      // 投影格：值上面已经算出来了，别再逐格回头扫一遍锚点。
      const hit = projected.get(key)
      if (hit !== undefined) {
        values[i] = { coord, value: hit }
        continue
      }
    }
    try {
      values[i] = { coord, value: valueAtRuntimeCoord(ref.sheetName, coord, ctx, evaluate) }
    } catch (err) {
      if (err instanceof NeedsDep) {
        // Placeholder never observed: the merged NeedsDep below aborts
        // the caller before `values` is returned.
        missing.push(...err.deps)
        values[i] = { coord, value: BLANK }
        continue
      }
      throw err
    }
  }
  if (missing.length > 0) throw new NeedsDep(missing)
  return { ok: true, values }
}

/**
 * `ref` 覆盖的矩形里所有**没有自有条目**的投影格。账本缺席 / 一个锚点都没压过来
 * 时返回空 Map，调用方零代价。
 */
function spillProjectedInRange(ref: RuntimeRef, ctx: EvalContext): Map<CellKey, Value> {
  const out = new Map<CellKey, Value>()
  const run = spillRunOf(ctx)
  if (!run) return out
  const cells = ref.sheetName ? ctx.crossSheetCells(ref.sheetName) : ctx.cells
  if (!cells) return out
  const scan = run.scan(ref.sheetName, ref.range)
  if (scan.anchors.length === 0) return out
  for (const hit of projectedCoordsIn(scan, ref.range, cells)) {
    out.set(cellKey(hit.coord), hit.value)
  }
  return out
}

export function valueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  // Literal / missing cells resolve straight from storage — O(1), no
  // trampoline fault. Routing them through `refLookup` made every
  // per-cell read inside the sparse aggregates THROW NeedsDep under the
  // trampoline shim, restarting the calling formula's whole evaluation
  // once per cell (scale-suite S3/S4 finding, 2026-06-12: SUM(A:A) over
  // N literals was O(N² log N); SUMIF(A:A, crit) re-ran once per
  // MATCHING cell — 1.86 s @ 50k). The direct read is semantics-
  // preserving: for a literal, `refLookup` returns exactly `cell.value`,
  // and for a missing cell, BLANK. Formula cells keep the original
  // paths (trampoline evaluation, cycle detection, lazy dep install)
  // untouched, as do out-of-bounds coords (#REF! via the parse failure).
  if (
    coord.row >= 0 &&
    coord.row <= EXCEL_MAX_ROW &&
    coord.col >= 0 &&
    coord.col <= EXCEL_MAX_COL
  ) {
    const storage = sheetName ? ctx.crossSheetCells(sheetName) : ctx.cells
    if (storage) {
      const cell = storage.get(cellKey(coord))
      // 自有条目缺席 → 问投影：这一格可能落在某个锚点的溢出矩形里。账本缺席时
      // （宿主自造 ctx）退回原来的「空」。
      if (!cell) return spillRunOf(ctx)?.at(sheetName, coord) ?? BLANK
      // 数组字面量（`setCellValue` 直接塞进来的锚点）作为单元格引用被读到时是
      // 左上角那个标量 —— 与公式锚点同一条规则，见 `anchorScalar`。
      if (!cell.ast) return anchorScalar(cell.value)
    }
  }
  const a1 = formatA1(coord)
  if (!sheetName) return ctx.refLookup(a1)
  const cells = ctx.crossSheetCells(sheetName)
  if (!cells) return ERR('#REF!')
  // 跨表单格：`evaluateCellTrampolined` 交回的是**原值**（锚点是整片数组），所以
  // 这里补上同表路径已经做过的那次折叠。
  return anchorScalar(
    evaluateInForeignSheet(
      { kind: 'ref', a1, absCol: false, absRow: false },
      ctx,
      cells,
      sheetName,
      evaluate,
    ),
  )
}

/**
 * `A1#` 专用：读锚点的**整片数组**，不折叠。
 *
 * 除这一条外，所有把地址读成值的路径都走 `valueAtRuntimeCoord`（折叠 + 投影）。
 * 两者的差别就是 Excel 里 `A1` 与 `A1#` 的差别。
 */
export function rawValueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const storage = sheetName ? ctx.crossSheetCells(sheetName) : ctx.cells
  const cell = storage?.get(cellKey(coord))
  if (storage && !cell) return spillRunOf(ctx)?.at(sheetName, coord) ?? BLANK
  if (cell && !cell.ast) return cell.value
  const a1 = formatA1(coord)
  if (sheetName) {
    const cells = ctx.crossSheetCells(sheetName)
    if (!cells) return ERR('#REF!')
    return evaluateInForeignSheet(
      { kind: 'ref', a1, absCol: false, absRow: false },
      ctx,
      cells,
      sheetName,
      evaluate,
    )
  }
  const raw = (ctx as SpillAwareContext).refLookupRaw
  return raw ? raw(a1) : ctx.refLookup(a1)
}
