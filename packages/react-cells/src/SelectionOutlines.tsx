import type { CSSProperties } from 'react'
import type { CellRange } from '@einfach/spreadsheet-ui-core'
import { DEFAULT_CELL_COLUMN_WIDTH, DEFAULT_CELL_ROW_HEIGHT } from './grid-defaults'

/** 只绘制与窗口相交的选区；隐藏尺寸为零，冻结接缝不会凭空多出边框。 */
export function SelectionOutlines({ window, ranges, rowHeights, columnWidths, reference }: {
  window: CellRange
  ranges: readonly CellRange[]
  rowHeights?: readonly number[]
  columnWidths?: readonly number[]
  reference: boolean
}) {
  return <>{ranges.map((selected, index) => {
    const clipped = {
      rowStart: Math.max(window.rowStart, selected.rowStart),
      rowEnd: Math.min(window.rowEnd, selected.rowEnd),
      colStart: Math.max(window.colStart, selected.colStart),
      colEnd: Math.min(window.colEnd, selected.colEnd),
    }
    if (clipped.rowStart > clipped.rowEnd || clipped.colStart > clipped.colEnd) return null
    const width = sumSizes(columnWidths, clipped.colStart - window.colStart,
      clipped.colEnd - window.colStart + 1, DEFAULT_CELL_COLUMN_WIDTH)
    const height = sumSizes(rowHeights, clipped.rowStart - window.rowStart,
      clipped.rowEnd - window.rowStart + 1, DEFAULT_CELL_ROW_HEIGHT)
    if (width <= 0 || height <= 0) return null
    const style = {
      '--selection-left': `${sumSizes(columnWidths, 0, clipped.colStart - window.colStart, DEFAULT_CELL_COLUMN_WIDTH)}px`,
      '--selection-top': `${sumSizes(rowHeights, 0, clipped.rowStart - window.rowStart, DEFAULT_CELL_ROW_HEIGHT)}px`,
      '--selection-width': `${width}px`, '--selection-height': `${height}px`,
    } as CSSProperties
    const className = ['selection-outline', reference && 'formula-reference-outline',
      clipped.rowStart === selected.rowStart && 'selection-outline-top',
      clipped.rowEnd === selected.rowEnd && 'selection-outline-bottom',
      clipped.colStart === selected.colStart && 'selection-outline-left',
      clipped.colEnd === selected.colEnd && 'selection-outline-right'].filter(Boolean).join(' ')
    return <div key={index} aria-hidden="true" className={className} style={style} />
  })}</>
}

function sumSizes(
  sizes: readonly number[] | undefined, start: number, end: number, fallback: number,
): number {
  let total = 0
  for (let index = start; index < end; index++) total += sizes?.[index] ?? fallback
  return total
}
