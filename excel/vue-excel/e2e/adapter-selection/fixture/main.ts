import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
  type CellCoord,
  type DisplayCell,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetGridView,
  SpreadsheetUiProvider,
  useSpreadsheetSelection,
} from '@einfach/vue-excel'
import { useSpreadsheetPointerSelection } from '@einfach/vue-excel/pointer-selection'
import { createApp, defineComponent, h } from 'vue'

const sheetId = 'vue-e2e-sheet'
const gridRange = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }
const cells: DisplayCell[] = [
  { row: 0, col: 0, displayValue: 'A1' },
  { row: 0, col: 1, displayValue: 'B1' },
  { row: 0, col: 2, displayValue: 'C1' },
  { row: 1, col: 0, displayValue: 'A2' },
  { row: 1, col: 1, displayValue: 'B2' },
  { row: 1, col: 2, displayValue: 'C2' },
  { row: 2, col: 0, displayValue: 'A3' },
  { row: 2, col: 1, displayValue: 'B3' },
  { row: 2, col: 2, displayValue: 'C3' },
]

/** Returns the same sparse projection for every browser request. */
const backend: SpreadsheetBackend = {
  async readVisibleProjection(request) {
    return {
      kind: 'visible-window',
      sheetId: request.sheetId,
      window: { ...request.window },
      requestId: request.requestId,
      revision: request.revision,
      cells,
    }
  },
  async readRangeProjection(request) {
    return {
      kind: 'range',
      sheetId: request.sheetId,
      range: { ...request.range },
      requestId: request.requestId,
      revision: request.revision,
      cells,
    }
  },
  async setCellInput(request) {
    return {
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: request.revision,
    }
  },
}

const store = createStore()
store.setter(setSelectionBoundsAtom, { rowCount: 3, colCount: 3 })

function coordFromEvent(event: PointerEvent): CellCoord | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const cell = target.closest<HTMLTableCellElement>('[data-row][data-col]')
  if (!cell) return null
  const row = Number(cell.dataset.row)
  const col = Number(cell.dataset.col)
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function formatRange(range: typeof gridRange): string {
  return `${range.rowStart}:${range.colStart}–${range.rowEnd}:${range.colEnd}`
}

/** Wires caller-owned native events into the adapter's public selection APIs. */
const AdapterSelectionFixture = defineComponent({
  name: 'AdapterSelectionFixture',
  setup() {
    const selection = useSpreadsheetSelection()
    const pointer = useSpreadsheetPointerSelection()

    const onPointerDown = (event: PointerEvent) => {
      const coord = coordFromEvent(event)
      if (coord) pointer.onPointerDown(event, { sheetId, coord })
    }
    const onPointerMove = (event: PointerEvent) => {
      const coord = coordFromEvent(event)
      if (coord) pointer.onPointerMove(event, coord)
    }

    return () =>
      h('main', { 'aria-label': 'Vue adapter browser fixture' }, [
        h('output', { 'data-testid': 'selection-range' }, formatRange(selection.value.range)),
        h(
          'div',
          {
            onPointercancel: pointer.onPointerCancel,
            onPointerdown: onPointerDown,
            onPointermove: onPointerMove,
            onPointerup: pointer.onPointerUp,
          },
          [
            h(SpreadsheetGridView, {
              cells,
              range: gridRange,
              selected: selection.value.range,
            }),
          ],
        ),
      ])
  },
})

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('The fixture root is missing.')

createApp({
  render: () =>
    h(SpreadsheetUiProvider, { backend, store }, { default: () => h(AdapterSelectionFixture) }),
}).mount(root)
