/**
 * 运行期引用矩形 `RuntimeRef` 这个抽象。
 *
 * 职责：定义「一个已经解析好的引用矩形」是什么，连同所有**不需要求值**就能对它
 * 做的查询 —— 裁剪、比较、含点判定、格数、稀疏可迭代性、所属表存不存在。
 *
 * 「怎么把表达式解析成 `RuntimeRef`」是另一件事，住在 `runtime-ref-resolve.ts`：
 * 那条路要回头调求值器，这里一行都不用。
 */
import type {
  Cell,
  CellCoord,
  CellKey,
  CellRange,
  EvalContext,
  LambdaReferenceBinding,
  Value,
} from '../types'
import { BLANK } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW, cellKey, iterateRange } from '../refs'
import { ERR } from './error-value'

export type RuntimeRef = LambdaReferenceBinding

/**
 * 稀疏遍历的**偏好阈值**：矩形大到这个数以上，有稀疏孪生的函数（SUM /
 * COUNTIF / SUMIF / *IFS / SUBTOTAL…）改走逐格遍历活单元格，而不是物化。
 *
 * ⚠️ 这**不是**「物化不动就拒绝」的安全闸门 —— 那道闸门是
 * `range-gate.ts` 的 `MATERIALIZE_REFUSE_CELL_CAP`（一整列 = 1,048,576 格）。
 * 两件事此前共用这一个常量，于是「性能上不划算」被当成了「算不出来」：没有
 * 稀疏孪生的那几百个函数在 10 万格以上一律吃 `#NUM!`，而这个 10 万本身是从
 * `spreadsheet-ui-core` 的 Go-To 扫描约定抄来的 UI 数字。分家的理由见
 * `range-gate.ts` 文件头。
 */
export const MATERIALIZED_RANGE_CELL_CAP = 100_000

export function topLeftRuntimeRef(ref: RuntimeRef): RuntimeRef {
  const materialized = ref.materialized ? [[ref.materialized[0]?.[0] ?? BLANK]] : undefined
  return {
    sheetName: ref.sheetName,
    range: {
      rowStart: ref.range.rowStart,
      rowEnd: ref.range.rowStart,
      colStart: ref.range.colStart,
      colEnd: ref.range.colStart,
    },
    ...(materialized ? { materialized } : {}),
  }
}

export function cellForRuntimeRef(
  ref: RuntimeRef,
  ctx: EvalContext,
): { readonly cell: Cell | undefined; readonly error?: undefined } | { readonly error: Value } {
  const cells = ref.sheetName ? ctx.crossSheetCells(ref.sheetName) : ctx.cells
  if (!cells) return { error: ERR('#REF!') }
  return {
    cell: cells.get(cellKey({ row: ref.range.rowStart, col: ref.range.colStart })),
  }
}

function shouldSparseIterate(range: CellRange): boolean {
  const wholeColumns = range.rowStart === 0 && range.rowEnd === EXCEL_MAX_ROW
  const wholeRows = range.colStart === 0 && range.colEnd === EXCEL_MAX_COL
  return wholeColumns || wholeRows || rangeCellCount(range) > MATERIALIZED_RANGE_CELL_CAP
}

export function canSparseIterate(ref: RuntimeRef): boolean {
  return !ref.materialized && shouldSparseIterate(ref.range)
}

export function rangeCellCount(range: CellRange): number {
  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

export function rangeContainsCoord(range: CellRange, coord: CellCoord): boolean {
  return (
    coord.row >= range.rowStart &&
    coord.row <= range.rowEnd &&
    coord.col >= range.colStart &&
    coord.col <= range.colEnd
  )
}

export function validateRuntimeRefSheet(ref: RuntimeRef, ctx: EvalContext): Value | undefined {
  if (!ref.sheetName) return undefined
  return ctx.crossSheetCells(ref.sheetName) ? undefined : ERR('#REF!')
}

export function sliceMaterialized(
  cells: Value[][],
  rowStartOffset: number,
  rowEndOffset: number,
  colStartOffset: number,
  colEndOffset: number,
): Value[][] {
  const out: Value[][] = []
  for (let r = rowStartOffset; r <= rowEndOffset; r += 1) {
    out.push(cells[r].slice(colStartOffset, colEndOffset + 1))
  }
  return out
}

export function sameRuntimeRefRange(a: RuntimeRef, b: RuntimeRef): boolean {
  if (a.sheetName !== b.sheetName) return false
  return (
    a.range.rowStart === b.range.rowStart &&
    a.range.rowEnd === b.range.rowEnd &&
    a.range.colStart === b.range.colStart &&
    a.range.colEnd === b.range.colEnd
  )
}

/**
 * 矩形里有没有**没有自有条目**的格子。没有 → 一个投影格都不可能有，整趟扫描可以
 * 省掉。密集区域（链式公式、导入的数据块）走的正是这一支，所以下沉投影对它们
 * 是零代价。
 */
export function rangeHasHole(range: CellRange, cells: ReadonlyMap<CellKey, Cell>): boolean {
  for (const coord of iterateRange(range)) {
    if (!cells.has(cellKey(coord))) return true
  }
  return false
}
