import type { Store } from '@einfach/core'
import type { FrameStats, Rect } from '@einfach/canvas'
import type { CellRange, DisplayCell, SpreadsheetBorderSpec } from '@einfach/spreadsheet-ui-core'

export interface CanvasCellsInput {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly mergedRanges?: readonly CellRange[]
  readonly mergeAnchors?: readonly DisplayCell[]
  readonly selected?: CellRange
  readonly rowHeights?: readonly number[]
  readonly columnWidths?: readonly number[]
  readonly interactive?: boolean
}
export interface CanvasCellsTheme {
  background: string
  foreground: string
  gridline: string
  selection: string
  selectionFill: string
  hover: string
  reference: string
  fontFamily: string
}
export interface CanvasCellsOptions {
  store: Store
  /** Visible rectangle relative to the supplied projection window. */
  viewport?: Rect
  /** Disable pixel reuse for comparison or custom rendering diagnostics. */
  reusePixels?: boolean
  pixelRatio?: number
  theme?: Partial<CanvasCellsTheme>
  onFrame?: (stats: FrameStats) => void
}
export interface BorderSegment {
  side: 'top' | 'right' | 'bottom' | 'left'
  bounds: Rect
  border?: SpreadsheetBorderSpec
}
export interface LayoutCell {
  key: string
  cell?: DisplayCell
  range: CellRange
  bounds: Rect
  merged: boolean
  borders: readonly BorderSegment[]
  signature: string
}
export interface CellAppearance {
  hovered: boolean
  selected: boolean
  edges: number
  reference: boolean
  showFormulas: boolean
  filter?: { table?: string; active: boolean; disabled: boolean }
}
export interface CellPaintModel { item: LayoutCell; appearance: CellAppearance }

export const defaultTheme: CanvasCellsTheme = {
  background: '#ffffff', foreground: '#252b37', gridline: '#dce1e8',
  selection: '#315cda', selectionFill: 'rgba(49,92,218,0.10)',
  hover: 'rgba(0,133,106,0.08)', reference: '#00856a',
  fontFamily: 'Arial, sans-serif',
}
