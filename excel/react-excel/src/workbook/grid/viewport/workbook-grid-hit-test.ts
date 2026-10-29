import { canvasCellAt } from '@einfach-excel/canvas-cells'
import {
  getAxisStartIndexAtOffset,
  type CellCoord,
} from '@einfach-excel/spreadsheet-ui-core'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

interface WorkbookViewportPoint {
  readonly clientX: number
  readonly clientY: number
  readonly bounds: Pick<DOMRect, 'top' | 'left'>
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly rowHeight: number
  readonly colWidth: number
  readonly colWidths?: Record<string, number>
  readonly rowHeaderWidth: number
  readonly rowCount: number
  readonly colCount: number
  readonly rowHeights?: Record<string, number>
  readonly frozenHeight?: number
  readonly frozenWidth?: number
}

/** Resolves a pointer location to the workbook cell rendered beneath it. */
export function workbookCellAt(
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
): CellCoord | null {
  const eventCell =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
  const target = event.target instanceof Element ? event.target : null
  return cellCoordinate(eventCell) ??
    canvasCellAt(target, event.clientX, event.clientY) ??
    workbookCellAtPoint(event.clientX, event.clientY)
}

/** Resolves viewport coordinates after the grid has moved beneath a captured pointer. */
export function workbookCellAtPoint(clientX: number, clientY: number): CellCoord | null {
  const target = document.elementFromPoint?.(clientX, clientY)
  return canvasCellAt(target, clientX, clientY) ??
    cellCoordinate(target?.closest<HTMLElement>('[data-cell]'))
}

/** Captured drags clamp headings to the nearest cell while projection DOM is non-interactive. */
export function workbookCellAtViewportPoint(input: WorkbookViewportPoint): CellCoord | null {
  // 指针可以停在表头内；仍按当前滚动位置扩选，不能把负值误判为冻结区而丢弃。
  const x = Math.max(0, input.clientX - input.bounds.left - input.rowHeaderWidth)
  const y = Math.max(0, input.clientY - input.bounds.top - input.rowHeight)
  const contentX = x + (x < (input.frozenWidth ?? 0) ? 0 : input.scrollLeft)
  const contentY = y + (y < (input.frozenHeight ?? 0) ? 0 : input.scrollTop)
  if (contentX < 0 || contentY < 0) return null

  const row = getAxisStartIndexAtOffset(
    contentY,
    input.rowCount,
    input.rowHeight,
    input.rowHeights,
  )
  const col = getAxisStartIndexAtOffset(contentX, input.colCount, input.colWidth, input.colWidths)
  return row < input.rowCount && col < input.colCount ? { row, col } : null
}

function cellCoordinate(cell: HTMLElement | null | undefined): CellCoord | null {
  const [row, col] = cell?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}
