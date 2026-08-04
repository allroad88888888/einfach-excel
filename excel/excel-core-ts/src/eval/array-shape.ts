/**
 * 数组结果的形状闸门。
 *
 * 职责：判定一个二维 `Value` 矩阵能不能作为数组结果落地 —— 行必须等长、格数
 * 不超过软上限、行列不超过 Excel 网格、格子里不能再嵌一片没摊开的数组 ——
 * 不合格就给出对应的错误值。
 */
import type { Value } from '../types'
import { EXCEL_MAX_COL, EXCEL_MAX_ROW } from '../refs'
import { ERR } from './error-value'

/** 数组结果的软上限（格数）。`spill-collision.ts` 用它砍「够不着」的候选锚点。 */
export const ARRAY_CELL_CAP = 1_048_576
const MAX_ARRAY_ROWS = EXCEL_MAX_ROW + 1
const MAX_ARRAY_COLS = EXCEL_MAX_COL + 1

export function arrayShapeError(
  rows: number,
  cols: number,
  label: string,
  capMessage = `${label} exceeds array cell cap`,
): Value | undefined {
  if (rows < 1 || cols < 1 || !Number.isFinite(rows) || !Number.isFinite(cols)) {
    return ERR('#VALUE!')
  }
  // Excel bounds the worksheet at 1,048,576 rows × 16,384 columns (XFD).
  // Requests beyond either axis surface `#NUM!` (Excel-compatible) — the
  // engine cell-cap (`ARRAY_CELL_CAP`) is a softer cap that keeps engine
  // memory bounded and surfaces `#VALUE!`.
  if (rows > MAX_ARRAY_ROWS || cols > MAX_ARRAY_COLS) {
    return ERR('#NUM!', `${label} exceeds Excel grid limits`)
  }
  if (rows * cols > ARRAY_CELL_CAP) return ERR('#VALUE!', capMessage)
  return undefined
}

export function scalarCellError(value: Value): Value | undefined {
  return value.kind === 'array' ? ERR('#CALC!', 'array result was not expanded') : undefined
}

export function matrixScalarCellError(matrix: Value[][]): Value | undefined {
  for (const row of matrix) {
    for (const cell of row) {
      const error = scalarCellError(cell)
      if (error) return error
    }
  }
  return undefined
}

export function arrayResult(matrix: Value[][], label = 'array result'): Value {
  const cols = matrix[0]?.length ?? 0
  const shapeError = arrayShapeError(matrix.length, cols, label)
  if (shapeError) return shapeError
  for (const row of matrix) {
    if (row.length !== cols) return ERR('#VALUE!', 'array rows must be rectangular')
  }
  return matrixScalarCellError(matrix) ?? { kind: 'array', value: matrix }
}
