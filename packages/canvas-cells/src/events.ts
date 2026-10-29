import { configureNativeFilterAtom, type CellCoord } from '@einfach-excel/spreadsheet-ui-core'
import type { Store } from '@einfach/core'
import type { CellPaintModel } from './types'

/** Canvas hover and filter targets; workbook selection/editing stays with its existing host. */
export function bindEvents(canvas: HTMLCanvasElement, store: Store, options: {
  hit: (x: number, y: number) => CellCoord | null
  model: (coord: CellCoord) => CellPaintModel | undefined
  point: (x: number, y: number) => { x: number; y: number }
  hover: (coord: CellCoord | null) => void
}) {
  function move(event: PointerEvent) {
    if (event.isPrimary === false || event.pointerType === 'touch') return
    const over = canvas.ownerDocument.elementFromPoint(event.clientX, event.clientY) === canvas
    options.hover(over ? options.hit(event.clientX, event.clientY) : null)
  }
  function leave() { options.hover(null) }
  function filterAt(event: MouseEvent) {
    const coord = options.hit(event.clientX, event.clientY)
    const model = coord && options.model(coord)
    if (!model?.appearance.filter) return undefined
    const { x, y } = options.point(event.clientX, event.clientY)
    const b = model.item.bounds
    return x >= b.x + b.width - 22 && y >= b.y + b.height / 2 - 10
      && y <= b.y + b.height / 2 + 10 ? model : undefined
  }
  function down(event: PointerEvent) {
    if (filterAt(event)) { event.stopPropagation(); event.preventDefault() }
  }
  function click(event: MouseEvent) {
    const model = filterAt(event)
    if (!model) return
    event.stopPropagation()
    if (event.type === 'dblclick' || model.appearance.filter?.disabled) return
    const table = model.appearance.filter?.table
    void store.setter(configureNativeFilterAtom, { type: 'open-column',
      col: model.item.range.colStart, ...(table ? { table } : {}) })
  }
  canvas.ownerDocument.addEventListener('pointermove', move)
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('click', click)
  canvas.addEventListener('dblclick', click)
  return () => {
    canvas.ownerDocument.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('click', click)
    canvas.removeEventListener('dblclick', click)
  }
}
