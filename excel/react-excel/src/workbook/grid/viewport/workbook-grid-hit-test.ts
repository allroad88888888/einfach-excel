import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

/** Resolves a pointer location to the workbook cell rendered beneath it. */
export function workbookCellAt(
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
): CellCoord | null {
  const eventCell =
    event.target instanceof Element ? event.target.closest<HTMLElement>('td[data-cell]') : null
  const pointCell = document
    .elementFromPoint?.(event.clientX, event.clientY)
    ?.closest<HTMLElement>('td[data-cell]')
  const [row, col] = (eventCell ?? pointCell)?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}
