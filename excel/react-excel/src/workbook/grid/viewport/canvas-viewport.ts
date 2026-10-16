import type { createCanvasCells } from '@einfach/canvas-cells'
import { WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT } from './workbook-grid-config'

/** Keep the bitmap at pane size while the host keeps its buffered projection coordinates. */
export function bindCanvasViewport(canvas: HTMLCanvasElement,
  view: ReturnType<typeof createCanvasCells>) {
  const owner = canvas.parentElement!
  const scroll = canvas.closest<HTMLElement>('.sheet-scroll')
  const pane = canvas.closest<HTMLElement>('.frozen-pane')
  const container = pane ?? scroll
  const sync = () => {
    if (!container) { view.flush(); return }
    const bounds = container.getBoundingClientRect(), origin = owner.getBoundingClientRect()
    const gutter = pane ? 0 : WORKBOOK_GRID_ROW_HEADER_WIDTH
    const heading = pane ? 0 : WORKBOOK_GRID_ROW_HEIGHT
    const x = bounds.left + container.clientLeft + gutter - origin.left
    const y = bounds.top + container.clientTop + heading - origin.top
    canvas.style.position = 'relative'
    canvas.style.left = `${x}px`; canvas.style.top = `${y}px`
    view.setViewport({ x, y, width: Math.max(1, container.clientWidth - gutter),
      height: Math.max(1, container.clientHeight - heading) })
    view.flush()
  }
  // Native scroll updates the small canvas before waiting for a React projection commit.
  scroll?.addEventListener('scroll', sync, { passive: true })
  const observer = new ResizeObserver(sync)
  if (container) observer.observe(container)
  sync()
  return { sync, dispose() { observer.disconnect(); scroll?.removeEventListener('scroll', sync) } }
}
