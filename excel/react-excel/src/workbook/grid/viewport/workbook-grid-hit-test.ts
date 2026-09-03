import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

interface WorkbookViewportPoint {
  readonly clientX: number
  readonly clientY: number
  readonly bounds: Pick<DOMRect, 'top' | 'left'>
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly rowHeight: number
  readonly colWidth: number
  readonly rowHeaderWidth: number
  readonly rowCount: number
  readonly colCount: number
}

/** Resolves a pointer location to the workbook cell rendered beneath it. */
export function workbookCellAt(
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
): CellCoord | null {
  const eventCell =
    event.target instanceof Element ? event.target.closest<HTMLElement>('td[data-cell]') : null
  return cellCoordinate(eventCell) ?? workbookCellAtPoint(event.clientX, event.clientY)
}

/** Resolves viewport coordinates after the grid has moved beneath a captured pointer. */
export function workbookCellAtPoint(clientX: number, clientY: number): CellCoord | null {
  const pointCell = document
    .elementFromPoint?.(clientX, clientY)
    ?.closest<HTMLElement>('td[data-cell]')
  return cellCoordinate(pointCell)
}

/** Maps viewport pixels to a cell while retained projection DOM is temporarily non-interactive. */
export function workbookCellAtViewportPoint(input: WorkbookViewportPoint): CellCoord | null {
  const contentX = input.scrollLeft + input.clientX - input.bounds.left - input.rowHeaderWidth
  const contentY = input.scrollTop + input.clientY - input.bounds.top - input.rowHeight
  if (contentX < 0 || contentY < 0) return null

  const row = Math.floor(contentY / input.rowHeight)
  const col = Math.floor(contentX / input.colWidth)
  return row < input.rowCount && col < input.colCount ? { row, col } : null
}

function cellCoordinate(cell: HTMLElement | null | undefined): CellCoord | null {
  const [row, col] = cell?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}
