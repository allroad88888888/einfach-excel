/**
 * 条件聚合的坐标换算：在两个同形区域（条件区 / 值区）之间按相对位置互换坐标。
 *
 * 只被 `eval/sparse-*.ts` 这一族用到 —— 它们是 `FUNCTIONS` 注册表里同名函数的
 * 第二实现，约定与事故留痕见 `sparse-aggregations.ts` 文件头。与 `./evaluate`
 * 的循环导入同样是有意的，同处有说明。
 */

import type { CellCoord, CellRange, EvalContext, LambdaReferenceBinding, Value } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW } from '../refs'
import { ERR, valueAtRuntimeCoord } from './evaluate'

type RuntimeRef = LambdaReferenceBinding

export function relativeCoord(
  source: CellRange,
  target: CellRange,
  coord: CellCoord,
): CellCoord | undefined {
  const row = target.rowStart + (coord.row - source.rowStart)
  const col = target.colStart + (coord.col - source.colStart)
  if (row < 0 || row > EXCEL_MAX_ROW || col < 0 || col > EXCEL_MAX_COL) return undefined
  return { row, col }
}

export function inverseRelativeCoord(
  source: CellRange,
  target: CellRange,
  coord: CellCoord,
): CellCoord | undefined {
  const row = source.rowStart + (coord.row - target.rowStart)
  const col = source.colStart + (coord.col - target.colStart)
  if (
    row < source.rowStart ||
    row > source.rowEnd ||
    col < source.colStart ||
    col > source.colEnd
  ) {
    return undefined
  }
  return { row, col }
}

export function sameRangeShape(a: CellRange, b: CellRange): boolean {
  return (
    a.rowEnd - a.rowStart === b.rowEnd - b.rowStart &&
    a.colEnd - a.colStart === b.colEnd - b.colStart
  )
}

export function valueAtRelativeCoord(
  source: CellRange,
  target: RuntimeRef,
  coord: CellCoord,
  ctx: EvalContext,
): Value {
  const targetCoord = relativeCoord(source, target.range, coord)
  return targetCoord ? valueAtRuntimeCoord(target.sheetName, targetCoord, ctx) : ERR('#REF!')
}
