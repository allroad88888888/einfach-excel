/** Determines whether Tab should retain its native focus-navigation behavior. */
export interface GridTabBoundary {
  sheetId: string
  rowCount: number
  colCount: number
  activeCell: {
    sheetId: string
    row: number
    col: number
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * At the edge of a grid, leave Tab unhandled so the browser can move focus
 * naturally. Text-entry controls keep their editor-specific Tab behavior.
 */
export function shouldLeaveGridOnTab(event: KeyboardEvent, boundary: GridTabBoundary): boolean {
  if (
    event.key !== 'Tab' ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isTextEntryTarget(event.target) ||
    boundary.activeCell.sheetId !== boundary.sheetId
  )
    return false

  const lastRow = Math.max(0, boundary.rowCount - 1)
  const lastCol = Math.max(0, boundary.colCount - 1)
  const atFirstCell = boundary.activeCell.row <= 0 && boundary.activeCell.col <= 0
  const atLastCell = boundary.activeCell.row >= lastRow && boundary.activeCell.col >= lastCol
  return event.shiftKey ? atFirstCell : atLastCell
}
