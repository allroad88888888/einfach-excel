/**
 * trampoline 的 shim `EvalContext`。
 *
 * 职责：造一个「把跨格读改成查缓存」的 `EvalContext` —— 缓存里有就交回，没有就
 * 抛 `NeedsDep` 请求 trampoline 先把那几格算出来。
 *
 * `NeedsDep` 与 `TrampolineFrame` 也住这里：前者是本模块**自己**抛出的信号，
 * 后者是它携带的载荷。放在这一侧，工作栈（`trampoline.ts`）单向依赖本文件，
 * 两边不成环。
 */
import type { Cell, CellKey, EvalContext, Value } from '../types'
import { BLANK } from '../types'
import { cellKey, iterateRange, parseRange, RangeTooLargeError } from '../refs'
import { anchorScalar, NO_SPILL_ANCHORS, projectedValueAt } from './spill-projection'
import type { SpillProjectionRun } from './spill-projection-run'
import { ERR } from './error-value'
import { cellCoordFromKey, parseRefToKey } from './cell-address'
import { cycleGuardKey } from './cycle-guard'
import { rangeHasHole } from './runtime-ref'
import { clampWholeAxisRange } from './whole-axis-clamp'
import type { SpillAwareContext } from './spill-aware-context'

/**
 * Sentinel thrown by the trampoline's shim `refLookup` / `rangeLookup`
 * to signal "this dep isn't in the cache yet; please resolve it first
 * and retry the current cell." Carries the list of missing deps so a
 * single `rangeLookup` covering N cells can request all of them at
 * once instead of forcing N retries.
 */
export class NeedsDep {
  constructor(
    readonly deps: ReadonlyArray<{
      readonly cells: ReadonlyMap<CellKey, Cell>
      readonly key: CellKey
      readonly guardKey: CellKey
    }>,
  ) {}
}

export interface TrampolineFrame {
  readonly cells: ReadonlyMap<CellKey, Cell>
  readonly key: CellKey
  readonly guardKey: CellKey
}

/**
 * Build the trampoline's shim `EvalContext`. The shim is a thin wrapper
 * around the host `ctx` (which still owns `callCustom`, `resolveName`,
 * `lambdaScope`, `lambdaRefScope`, `lambdaCallDepth`); only the ref / range / crossSheet
 * lookups are intercepted to consult the cache instead of recursing.
 *
 * `currentlyEvaluating` is still passed through for compatibility with
 * any code path that wants to check it, but it's the trampoline's
 * `inProgress` set that actually drives cycle detection now.
 */
export function makeTrampolineCtx(
  cells: ReadonlyMap<CellKey, Cell>,
  currentKey: CellKey,
  hostCtx: EvalContext,
  cache: Map<CellKey, Value>,
  inProgress: Set<CellKey>,
  spill: SpillProjectionRun,
): EvalContext {
  /**
   * 「把一个地址读成值」的单点。两条分支：
   *
   *  - 有自有条目 → 读它自己的值，数组折叠成左上角标量（`=A1+1` 在
   *    `A1 = =SEQUENCE(3)` 上给 2，不是一片）。
   *  - 没有自有条目 → 问投影账本：可能落在某个锚点的溢出矩形里。
   */
  const readKey = (targetCells: ReadonlyMap<CellKey, Cell>, key: CellKey): Value => {
    if (!targetCells.has(key)) {
      const coord = cellCoordFromKey(key)
      // trampoline 的 shim 只绑本表；跨表走 `evaluateInForeignSheet`。
      return (coord ? spill.at(undefined, coord) : undefined) ?? BLANK
    }
    return anchorScalar(lookupKey(targetCells, key))
  }

  const lookupKey = (
    targetCells: ReadonlyMap<CellKey, Cell>,
    key: CellKey,
  ): Value => {
    const guardKey = cycleGuardKey(targetCells, key)
    const cached = cache.get(guardKey)
    if (cached !== undefined) return cached
    if (inProgress.has(guardKey)) {
      // The dep is still on the work stack — by definition, evaluating
      // it again here would recurse into a cycle. Stamp it #CIRCULAR!
      // so the in-flight cell sees the error this iteration; the dep's
      // own work-stack frame will pick up the same cached value when it
      // pops.
      const circ = ERR('#CIRCULAR!')
      cache.set(guardKey, circ)
      return circ
    }
    throw new NeedsDep([{ cells: targetCells, key, guardKey }])
  }

  const ctx: SpillAwareContext = {
    cells,
    currentlyEvaluating: hostCtx.currentlyEvaluating,
    spillProjection: spill,
    refLookup: (a1) => {
      const coord = parseRefToKey(a1)
      if (!coord) return ERR('#REF!')
      return readKey(cells, coord)
    },
    refLookupRaw: (a1) => {
      const coord = parseRefToKey(a1)
      if (!coord) return ERR('#REF!')
      return cells.has(coord) ? lookupKey(cells, coord) : readKey(cells, coord)
    },
    rangeLookup: (start, end) => {
      const parsed = parseRange(start, end)
      if (!parsed) return [[ERR('#REF!')]]
      // 整轴引用先夹到已用区域 —— 也让下面的 `iterateRange` 别走 1M 圈空转。
      const range = clampWholeAxisRange(parsed, cells)
      const rowCount = range.rowEnd - range.rowStart + 1
      const colCount = range.colEnd - range.colStart + 1
      const totalCells = rowCount * colCount
      if (totalCells > 100_000) {
        const msg =
          `range too large to materialize (${rowCount}x${colCount} = ` +
          `${totalCells} cells; cap 100000)`
        return [[ERR('#NUM!', msg)]]
      }
      // Walk the range twice if needed: first collect every missing
      // dep into one NeedsDep batch (so a SUM(A1:A100) on a chained
      // column doesn't fault 100 times — once is enough). Only resort
      // to actual materialization once every cell in the range is
      // resolved.
      const missing: { cells: typeof cells; key: CellKey; guardKey: CellKey }[] = []
      for (const coord of iterateRange(range)) {
        const k = cellKey(coord)
        const gk = cycleGuardKey(cells, k)
        if (cache.has(gk) || inProgress.has(gk)) continue
        // We need this dep. Only push if the cell exists with an AST —
        // literal / missing cells resolve inline below.
        const cell = cells.get(k)
        if (cell && cell.ast) {
          missing.push({ cells, key: k, guardKey: gk })
        }
      }
      if (missing.length > 0) {
        throw new NeedsDep(missing)
      }
      // 压到这个矩形上的锚点，一次扫完 —— 逐格再问一遍会把 O(格数) 变成
      // O(格数 × cells)。矩形没有空洞时一趟都不扫（密集区域零代价）。扫描内部
      // 可能抛 `NeedsDep`（候选还没算），trampoline 接住。
      const spilled = rangeHasHole(range, cells)
        ? spill.scan(undefined, range)
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
          // Either the cell is a non-ast literal/missing (resolve
          // inline) or its value is in cache (via the previous pass).
          const cell = cells.get(k)
          if (!cell) {
            // 自有条目缺席 → 可能是别人的投影格。
            buf![coord.col - range.colStart] = projectedValueAt(spilled, coord) ?? BLANK
          } else if (!cell.ast) {
            buf![coord.col - range.colStart] = anchorScalar(cell.value)
          } else {
            const gk = cycleGuardKey(cells, k)
            const cached = cache.get(gk)
            if (cached !== undefined) {
              // 锚点在区域里：读到的是它左上角那个标量，不是整片。没有这一折叠，
              // `SUM(A1:A3)` 会拿到一个「3 行 1 列的格子」而报 `#CALC!`。
              buf![coord.col - range.colStart] = anchorScalar(cached)
            } else if (inProgress.has(gk)) {
              const circ = ERR('#CIRCULAR!')
              cache.set(gk, circ)
              buf![coord.col - range.colStart] = circ
            } else {
              // Shouldn't happen — we just verified above. Defensive
              // fallback: throw NeedsDep so the trampoline pushes it.
              throw new NeedsDep([{ cells, key: k, guardKey: gk }])
            }
          }
        }
      } catch (err) {
        if (err instanceof RangeTooLargeError) {
          return [[ERR('#NUM!', err.message)]]
        }
        throw err
      }
      return rows
    },
    crossSheetCells: hostCtx.crossSheetCells,
    callCustom: hostCtx.callCustom,
    resolveName: hostCtx.resolveName,
    currentCell: cellCoordFromKey(currentKey) ?? hostCtx.currentCell,
    currentSheetName: hostCtx.currentSheetName,
    currentSheetIndex: hostCtx.currentSheetIndex,
    sheetCount: hostCtx.sheetCount,
    sheetIndexOf: hostCtx.sheetIndexOf,
    lambdaScope: hostCtx.lambdaScope,
    lambdaRefScope: hostCtx.lambdaRefScope,
    lambdaFunctionScope: hostCtx.lambdaFunctionScope,
    lambdaOmittedParams: hostCtx.lambdaOmittedParams,
    lambdaCallDepth: hostCtx.lambdaCallDepth,
    locale: hostCtx.locale,
    onFormulaEvaluated: hostCtx.onFormulaEvaluated,
  }
  return ctx
}
