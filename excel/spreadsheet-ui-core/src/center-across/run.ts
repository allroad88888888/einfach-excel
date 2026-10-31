import type { DisplayCell } from '../backend'

/** 跨列居中的连续区间：从锚点列到最后一个被吞并的空格列（闭区间）。 */
export interface CenterAcrossRun {
  readonly colStart: number
  readonly colEnd: number
}

/** Excel 的“空”：没有显示文本且不是公式（公式返回 "" 仍然挡住溢出）。 */
function isEmpty(cell: DisplayCell | undefined): boolean {
  return !cell || (cell.displayValue === '' && cell.formula === undefined)
}

function isMerged(cell: DisplayCell): boolean {
  return cell.mergedSpan !== undefined || cell.mergeAnchor !== undefined
}

function hasCenterAcross(cell: DisplayCell | undefined): cell is DisplayCell {
  return cell?.format?.align === 'centerAcross' && !isMerged(cell)
}

/**
 * 纯显示几何：`(row, col)` 若是非空且 centerAcross 的锚点，返回它向右连续吞并的
 * 同为 centerAcross 的空格区间（不含窗口外的列）；非锚点返回 null。
 * 遇到非空格、未设置 centerAcross 的格子或合并格即停止。
 */
export function centerAcrossRun(
  cellAt: (row: number, col: number) => DisplayCell | undefined,
  row: number,
  col: number,
  lastCol: number,
): CenterAcrossRun | null {
  const anchor = cellAt(row, col)
  if (!hasCenterAcross(anchor) || isEmpty(anchor)) return null
  let colEnd = col
  while (colEnd < lastCol) {
    const next = cellAt(row, colEnd + 1)
    if (!hasCenterAcross(next) || !isEmpty(next)) break
    colEnd += 1
  }
  return { colStart: col, colEnd }
}
