import {
  getAxisStartIndexAtOffset,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
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
  return cellCoordinate(eventCell) ?? workbookCellAtPoint(event.clientX, event.clientY)
}

/** Resolves viewport coordinates after the grid has moved beneath a captured pointer. */
export function workbookCellAtPoint(clientX: number, clientY: number): CellCoord | null {
  const pointCell = document
    .elementFromPoint?.(clientX, clientY)
    ?.closest<HTMLElement>('[data-cell]')
  return cellCoordinate(pointCell)
}

/** Maps viewport pixels to a cell while retained projection DOM is temporarily non-interactive. */
export function workbookCellAtViewportPoint(input: WorkbookViewportPoint): CellCoord | null {
  const x = input.clientX - input.bounds.left - input.rowHeaderWidth
  const y = input.clientY - input.bounds.top - input.rowHeight
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
