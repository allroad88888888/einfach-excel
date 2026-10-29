import { createCanvas, useAtomValue, useCache, type CanvasCell, type FrameStats } from '@einfach-excel/canvas'
import { drawGridCell } from './drawing'
import { observedStore } from './ui'
import { createGridAtom, createGridSelection, type SelectionInfo } from './grid-selection'

const columns = 20
const cellWidth = 60
const cellHeight = 34

export function createGridRegion(
  canvas: HTMLCanvasElement, initialRows: number, onFrame: (stats: FrameStats) => void,
  onSelection: (info: SelectionInfo) => void,
) {
  const probe = observedStore()
  let rows = initialRows
  let createdAtoms = 0
  let createdCells = 0
  let cells: CanvasCell[] = []
  const surface = createCanvas(canvas, {
    store: probe.store, width: columns * cellWidth, height: rows * cellHeight, onFrame,
  })
  const getCell = surface.run(() => useCache((index: number) => {
    createdAtoms++
    return createGridAtom(index)
  }))
  const selection = createGridSelection(canvas, probe.store, getCell, () => rows, onSelection)
  function hide() {
    selection.reset()
    for (const cell of cells) cell.dispose()
    cells = []
  }
  function mountCell(index: number) {
    return surface.createCell({
      x: index % columns * cellWidth, y: Math.floor(index / columns) * cellHeight,
      width: cellWidth, height: cellHeight,
    }, () => {
      createdCells++
      const value = useAtomValue(getCell(index))
      selection.bindCell()
      return (ctx, rect) => {
        const state = value()
        drawGridCell(ctx, rect, state.value, index, state)
      }
    })
  }
  function show(nextRows = rows) {
    hide()
    rows = nextRows
    surface.resize(columns * cellWidth, rows * cellHeight)
    for (let index = 0; index < rows * columns; index++) cells.push(mountCell(index))
  }
  function update(count: number) {
    const selected = new Set<number>()
    while (selected.size < Math.min(count, rows * columns)) {
      selected.add(Math.floor(Math.random() * rows * columns))
    }
    for (const index of selected) {
      const entity = getCell(index)
      const state = probe.store.getter(entity)
      probe.store.setter(entity, { ...state, value: state.value + 1 })
    }
  }
  show()
  return {
    show, hide, update, getCell, clearSelection: selection.clear,
    stats: () => ({ createdAtoms, createdCells, subscriptions: probe.subscriptions() }),
    dispose() {
      selection.dispose()
      try { surface.dispose() } finally { cells = []; probe.store.clear() }
    },
  }
}
