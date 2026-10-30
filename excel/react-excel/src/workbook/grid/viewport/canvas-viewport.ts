import type { createCanvasCells } from '@einfach-excel/canvas-cells'
import { WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT } from './workbook-grid-config'
import { gridZoomOf } from '../../zoom/grid-zoom'

/** Keep a bounded painted margin for native scrolling ahead of the main thread. */
export function bindCanvasViewport(canvas: HTMLCanvasElement,
  view: ReturnType<typeof createCanvasCells>) {
  const owner = canvas.parentElement!
  const scroll = canvas.closest<HTMLElement>('.sheet-scroll')
  const pane = canvas.closest<HTMLElement>('.frozen-pane')
  const frame = canvas.closest<HTMLElement>('.sheet-grid-frame')
  const container = pane ?? scroll
  const sync = () => {
    if (!container) { view.flush(); return }
    const bounds = container.getBoundingClientRect(), origin = owner.getBoundingClientRect()
    // 矩形是屏幕像素，画布定位与 clientWidth 是缩放后网格内的逻辑像素。
    const zoom = gridZoomOf(canvas)
    const gutter = pane ? 0 : WORKBOOK_GRID_ROW_HEADER_WIDTH
    const heading = pane ? 0 : WORKBOOK_GRID_ROW_HEIGHT
    const width = Math.max(1, container.clientWidth - gutter)
    const height = Math.max(1, container.clientHeight - heading)
    // A bitmap ending at the visible edge exposes blank strips before scroll fires.
    // Frozen panes stay fixed; the scrolling body needs already-painted pixels on all sides.
    const padX = pane ? 0 : Math.min(128, Math.floor(width / 4))
    const padY = pane ? 0 : Math.min(128, Math.floor(height / 4))
    let x = (bounds.left - origin.left) / zoom + container.clientLeft + gutter - padX
    let y = (bounds.top - origin.top) / zoom + container.clientTop + heading - padY
    if (!pane && frame) {
      // The margin must not grow the scrollable overflow when reaching the last row/column.
      const end = frame.getBoundingClientRect()
      x = Math.min(x, (end.right - origin.left) / zoom - width - 2 * padX)
      y = Math.min(y, (end.bottom - origin.top) / zoom - height - 2 * padY)
    }
    canvas.style.position = 'relative'
    canvas.style.left = `${x}px`; canvas.style.top = `${y}px`
    view.setViewport({ x, y, width: width + 2 * padX, height: height + 2 * padY })
    view.flush()
  }
  // Native scroll updates the small canvas before waiting for a React projection commit.
  scroll?.addEventListener('scroll', sync, { passive: true })
  const observer = new ResizeObserver(sync)
  if (container) observer.observe(container)
  sync()
  return { sync, dispose() { observer.disconnect(); scroll?.removeEventListener('scroll', sync) } }
}
