import type { CellRange } from '../shared'
import type { DisplayCell } from './types'

/** Host presentation contract; it does not expose the private Canvas renderer package. */
export interface CanvasCellPaintContext {
  readonly context: CanvasRenderingContext2D
  readonly cell?: Readonly<DisplayCell>
  readonly range: Readonly<CellRange>
  readonly bounds: { readonly x: number; readonly y: number;
    readonly width: number; readonly height: number }
  readonly merged: boolean
}
export interface CanvasCellPaintHooks {
  /** Return false to replace default paint. Bounds are sheet-space pixels. */
  readonly before?: (cell: CanvasCellPaintContext) => boolean | void
  readonly after?: (cell: CanvasCellPaintContext) => void
  readonly onError?: (error: unknown) => void
}
