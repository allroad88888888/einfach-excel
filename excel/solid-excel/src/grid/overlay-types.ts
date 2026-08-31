import type {
  ActiveSpillRegion,
  CellRange,
  ClipboardState,
  DisplayCell,
  FormulaReferenceToken,
  PointerSessionState,
  SelectionState,
} from '@einfach/spreadsheet-ui-core'

export const FORMULA_REFERENCE_PALETTE = [
  '#1d6f42',
  '#c75450',
  '#3478f6',
  '#b54793',
  '#d97706',
  '#0891b2',
] as const

export const OVERLAY_COLORS = {
  primarySelectionFill: 'rgba(16, 124, 65, 0.10)',
  primarySelectionBorder: '#107c41',
  secondarySelectionFill: 'rgba(16, 124, 65, 0.06)',
  secondarySelectionBorder: '#86c3a3',
  activeCellBorder: '#107c41',
  fillHandle: '#107c41',
  fillHandleStroke: '#ffffff',
  mergeBorder: '#8f8f8f',
  spillBorder: '#2b579a',
  freezeDivider: '#a0a0a0',
  marchingAnts: '#107c41',
  marchingAntsBg: '#ffffff',
  dropIndicator: '#3478f6',
} as const

export const OVERLAY_BORDER_WIDTH = {
  primary: 2,
  secondary: 1,
  active: 2,
  merge: 1,
  spill: 1,
  freeze: 2,
  marchingAnts: 1.5,
  drop: 2,
} as const
export const FILL_HANDLE_SIZE = 6

export interface OverlayContext {
  canvas: HTMLCanvasElement | { width: number; height: number }
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineDashOffset: number
  globalAlpha: number
  setLineDash(segments: number[]): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  fill(): void
  save(): void
  restore(): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
}

export type OverlayContextFactory = (canvas: HTMLCanvasElement) => OverlayContext | null

export interface OverlayViewportProvider {
  getCellRect(row: number, col: number): OverlayRect | null
  getSurfaceSize(): { width: number; height: number }
  getSheetId(): string
  getCells(): readonly DisplayCell[]
  getFreezeOrigin(): { x: number; y: number }
  getVisibleRows?(): readonly number[]
  getVisibleCols?(): readonly number[]
}

export type OverlayDirtyReason =
  | 'selection'
  | 'pointer'
  | 'clipboard'
  | 'viewport'
  | 'metrics'
  | 'projection'
  | 'resize'
  | 'marching-ants'
export interface OverlayRect {
  x: number
  y: number
  w: number
  h: number
}
export interface OverlaySnapshot {
  selectionRegions: readonly SelectionState[]
  activeCell: { row: number; col: number; sheetId: string }
  selectionRange: CellRange
  pointerSession: PointerSessionState
  clipboard: ClipboardState
  freezeRows: number
  freezeCols: number
  marchingAntsOffset: number
  formulaReferenceTokens: readonly FormulaReferenceToken[]
  formulaReferenceSheetId: string | null
  spillRegion: ActiveSpillRegion | null
}
