import { atom, type Atom } from '@einfach/core'
import { createCanvas, useAtomValue, type CanvasCell, type Rect } from '@einfach/canvas'
import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import { appearanceAtoms, appearanceReader, sameAppearance } from './appearance'
import { createProjectionLayout } from './projection-layout'
import { paintCell } from './paint-cell'
import { bindEvents } from './events'
import { registerHitTest } from './hit-test'
import { defaultTheme, type CanvasCellsInput, type CanvasCellsOptions, type CellPaintModel } from './types'

/** Own one visible pane. A record and its atom subscription live exactly as long as its cell. */
export function createCanvasCells(canvas: HTMLCanvasElement, initial: CanvasCellsInput,
  options: CanvasCellsOptions) {
  const { store } = options
  const theme = { ...defaultTheme, ...options.theme }
  const records = new Map<string, {
    entity: ReturnType<typeof atom<CellPaintModel>>
    view: CanvasCell
    model: CellPaintModel
  }>()
  const surface = createCanvas(canvas, { store, width: 1, height: 1,
    background: theme.background, pixelRatio: options.pixelRatio,
    pointerEvents: false, onFrame: options.onFrame })
  let viewport = options.viewport
  let input = initial
  const project = createProjectionLayout(store)
  let layout: ReturnType<typeof project>
  let layoutBuilds = 0
  let disposed = false
  let hovered: string | undefined
  let width = -1, height = -1, ratio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1
  let appearance = appearanceReader(store, input)
  const cleanup: (() => void)[] = []
  function recordAt(coord: CellCoord) {
    return records.get(`m:${coord.row}:${coord.col}`) ?? records.get(`c:${coord.row}:${coord.col}`)
  }
  function point(clientX: number, clientY: number) {
    const box = canvas.getBoundingClientRect()
    return {
      x: layout.origin.x + (viewport?.x ?? 0)
        + (box.width ? (clientX - box.left) * width / box.width : -1),
      y: layout.origin.y + (viewport?.y ?? 0)
        + (box.height ? (clientY - box.top) * height / box.height : -1),
    }
  }
  function hitTest(clientX: number, clientY: number) {
    if (disposed || input.interactive === false) return null
    const p = point(clientX, clientY)
    return layout.hit(p.x, p.y)
  }
  function refreshCell(record: typeof records extends Map<string, infer R> ? R : never) {
    const next = appearance(record.model.item, hovered === record.model.item.key)
    if (sameAppearance(next, record.model.appearance)) return
    record.model = { ...record.model, appearance: next }
    store.setter(record.entity, record.model)
  }
  function refresh() {
    if (disposed) return
    appearance = appearanceReader(store, input)
    for (const record of records.values()) refreshCell(record)
  }
  function hover(coord: CellCoord | null) {
    const next = coord ? recordAt(coord)?.model.item.key : undefined
    if (hovered === next) return
    const previous = hovered
    hovered = next
    if (previous && records.has(previous)) refreshCell(records.get(previous)!)
    if (next && records.has(next)) refreshCell(records.get(next)!)
    canvas.style.cursor = next ? 'cell' : 'default'
  }
  function resizeViewport() {
    const view = viewport ?? { x: 0, y: 0, width: layout.width, height: layout.height }
    const nextRatio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1
    if (width !== view.width || height !== view.height || ratio !== nextRatio) {
      width = view.width; height = view.height; ratio = nextRatio
      surface.resize(Math.max(1, width), Math.max(1, height), ratio)
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
    }
    surface.setViewport({ x: layout.origin.x + view.x, y: layout.origin.y + view.y,
      width: Math.max(1, width), height: Math.max(1, height) })
    canvas.dataset.viewportX = String(view.x); canvas.dataset.viewportY = String(view.y)
  }
  function setViewport(view: Rect) {
    viewport = view
    resizeViewport()
  }
  function update(next: CanvasCellsInput) {
    if (disposed) throw new Error('Canvas cells have been disposed.')
    const previous = input
    input = next
    const nextLayout = project(next)
    if (layout === nextLayout) {
      if (previous.selected !== next.selected || previous.interactive !== next.interactive) {
        if (next.interactive === false) hovered = undefined
        refresh()
      }
      resizeViewport()
      return
    }
    layout = nextLayout
    canvas.dataset.layoutBuilds = String(++layoutBuilds)
    resizeViewport()
    if (input.interactive === false) hovered = undefined
    appearance = appearanceReader(store, input)
    const nextItems = new Map(layout.items.map(item => [item.key, item]))
    for (const [key, record] of records) {
      const item = nextItems.get(key)
      if (!item) {
        record.view.dispose(); records.delete(key)
      }
    }
    for (const item of layout.items) {
      const current = records.get(item.key)
      const model = { item, appearance: appearance(item, hovered === item.key) }
      if (current) {
        current.view.setBounds(item.bounds)
        if (current.model.item.signature !== item.signature
          || !sameAppearance(current.model.appearance, model.appearance)) {
          current.model = model; store.setter(current.entity, model)
        }
      } else {
        const entity = atom<CellPaintModel>(model)
        const view = surface.createCell(item.bounds, () => {
          const value = useAtomValue(entity)
          return ctx => paintCell(ctx, value(), theme)
        })
        records.set(item.key, { entity, view, model })
      }
    }
    canvas.dataset.canvasCells = 'true'
    canvas.dataset.cellCount = String(records.size)
    canvas.dataset.rowStart = String(input.window.rowStart)
    canvas.dataset.colStart = String(input.window.colStart)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const stop of cleanup.reverse()) stop()
    surface.dispose(); records.clear()
    delete canvas.dataset.canvasCells
    delete canvas.dataset.cellCount
    delete canvas.dataset.rowStart
    delete canvas.dataset.colStart
  }
  try {
    update(initial)
    for (const entity of appearanceAtoms) cleanup.push(store.sub(entity as Atom<unknown>, refresh))
    cleanup.push(registerHitTest(canvas, hitTest))
    cleanup.push(bindEvents(canvas, store, { hit: hitTest, point, hover,
      model: coord => recordAt(coord)?.model }))
  } catch (error) { dispose(); throw error }
  return { update, setViewport, hitTest, flush: surface.flush, dispose }
}
