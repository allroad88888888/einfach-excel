/** Synchronizes the selected atom cell with the grid's ARIA active descendant. */
export interface GridActiveCell {
  sheetId: string
  row: number
  col: number
}

interface MergeAnchor {
  el: HTMLElement
  row: number
  col: number
}

export interface GridActiveDescendantOptions {
  gridRoot: HTMLElement | undefined
  sheetId: string
  activeCell: GridActiveCell
  findMergeAnchorCovering: (row: number, col: number) => MergeAnchor | null
}

function cellId(sheetId: string, row: number, col: number): string {
  return `spreadsheet-grid-cell-${encodeURIComponent(sheetId)}-${row}-${col}`
}

function findRenderedCell(gridRoot: HTMLElement, row: number, col: number): HTMLElement | null {
  return gridRoot.querySelector<HTMLElement>(
    `td.spreadsheet-grid-cell[data-row="${row}"][data-col="${col}"]`,
  )
}

/**
 * Keeps DOM-only ARIA wiring in sync with the authoritative selection atom.
 * Covered merged cells resolve to their rendered merge anchor.
 */
export function syncGridActiveDescendant(options: GridActiveDescendantOptions): void {
  const { gridRoot, sheetId, activeCell, findMergeAnchorCovering } = options
  if (!gridRoot || activeCell.sheetId !== sheetId) {
    gridRoot?.removeAttribute('aria-activedescendant')
    return
  }

  const directCell = findRenderedCell(gridRoot, activeCell.row, activeCell.col)
  const mergeAnchor = directCell ? null : findMergeAnchorCovering(activeCell.row, activeCell.col)
  const target = directCell ?? mergeAnchor?.el
  if (!target) {
    gridRoot.removeAttribute('aria-activedescendant')
    return
  }

  const row = mergeAnchor?.row ?? activeCell.row
  const col = mergeAnchor?.col ?? activeCell.col
  const id = cellId(sheetId, row, col)
  target.id = id
  gridRoot.setAttribute('aria-activedescendant', id)
}
