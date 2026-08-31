import { onCleanup, onMount } from 'solid-js'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetUiStore } from '../provider'
import { OverlayRenderer } from './overlay-canvas-renderer'
import type { OverlayContextFactory } from './overlay-types'

export { OverlayRenderer } from './overlay-canvas-renderer'
export {
  FILL_HANDLE_SIZE,
  FORMULA_REFERENCE_PALETTE,
  OVERLAY_BORDER_WIDTH,
  OVERLAY_COLORS,
} from './overlay-types'
export type {
  OverlayContext,
  OverlayContextFactory,
  OverlayDirtyReason,
  OverlayViewportProvider,
} from './overlay-types'

export interface SpreadsheetGridOverlayProps {
  sheetId: string
  getCellRect: (row: number, col: number) => { x: number; y: number; w: number; h: number } | null
  getSurfaceSize: () => { width: number; height: number }
  getCells: () => readonly DisplayCell[]
  getFreezeOrigin?: () => { x: number; y: number }
  getVisibleRows?: () => readonly number[]
  getVisibleCols?: () => readonly number[]
  contextFactory?: OverlayContextFactory
  onRendererReady?: (renderer: OverlayRenderer) => void
}

export function SpreadsheetGridOverlay(props: SpreadsheetGridOverlayProps) {
  const store = useSpreadsheetUiStore()
  const renderer = new OverlayRenderer(props.contextFactory)
  let canvas: HTMLCanvasElement | undefined
  onMount(() => {
    if (!canvas) return
    renderer.attach(canvas, store, {
      getCellRect: props.getCellRect,
      getSurfaceSize: props.getSurfaceSize,
      getSheetId: () => props.sheetId,
      getCells: props.getCells,
      getFreezeOrigin: () => props.getFreezeOrigin?.() ?? { x: 0, y: 0 },
      getVisibleRows: props.getVisibleRows,
      getVisibleCols: props.getVisibleCols,
    })
    props.onRendererReady?.(renderer)
    const observer =
      typeof ResizeObserver !== 'undefined' && canvas.parentElement
        ? new ResizeObserver(() => {
            renderer.resize()
            renderer.markDirty('resize')
          })
        : null
    observer?.observe(canvas.parentElement!)
    onCleanup(() => {
      observer?.disconnect()
      renderer.detach()
    })
  })
  return (
    <canvas
      ref={canvas}
      class="spreadsheet-grid-overlay-canvas"
      data-testid="grid-overlay-canvas"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: '0',
        'pointer-events': 'none',
        width: '100%',
        height: '100%',
      }}
    />
  )
}
