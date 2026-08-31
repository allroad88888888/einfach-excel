import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'

/** Narrow feature dependencies that avoid coupling installers to the composed host. */
export interface GridFocusPort {
  focusGrid: () => void
}

export interface GridMergeRangePort {
  getMergeRangeForCoord: (row: number, col: number) => CellRange | null
}

export interface GridSelectionLayoutPort {
  getCellMap: () => Map<string, DisplayCell>
  getRows: () => number[]
  getCols: () => number[]
}

export interface GridSelectionContextPort {
  getSelectionRangeContaining: (row: number, col: number) => CellRange | null
}

export interface GridOutlineLayoutPort {
  getRowSpanHeight: (start: number, end: number) => number
  getColumnSpanWidth: (start: number, end: number) => number
}

export interface GridOutlineRenderPort {
  hasColOutline: () => boolean
  hasRowOutline: () => boolean
  getColOutlineBandHeight: () => number
  getRowOutlineGutterWidth: () => number
  freezeRowCount: () => number
  freezeColCount: () => number
  showHeadings: () => boolean
}

export interface GridScrollSurfacePort {
  getRowScrollSurfacePx: () => number
  getColScrollSurfacePx: () => number
}

export interface GridMergeAnchor {
  readonly el: HTMLElement
  readonly row: number
  readonly col: number
}

export interface GridMergeAnchorPort {
  findMergeAnchorCovering: (row: number, col: number) => GridMergeAnchor | null
}
