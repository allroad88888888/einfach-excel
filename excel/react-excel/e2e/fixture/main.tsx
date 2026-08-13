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
} from '@einfach/react-excel'
import { useSpreadsheetPointerSelection } from '@einfach/react-excel/pointer-selection'
import { createRoot } from 'react-dom/client'
import type { PointerEvent as ReactPointerEvent } from 'react'

const GRID_WINDOW = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }
const GRID_CELLS: readonly DisplayCell[] = Array.from({ length: 16 }, (_, index) => ({
  row: Math.floor(index / 4),
  col: index % 4,
  displayValue: `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`,
}))

const unsupportedBackendOperation = (): never => {
  throw new Error('The controlled adapter fixture does not fetch or mutate a backend.')
}

const deterministicBackend: SpreadsheetBackend = Object.freeze({
  readVisibleProjection: unsupportedBackendOperation,
  readRangeProjection: unsupportedBackendOperation,
  setCellInput: unsupportedBackendOperation,
})

const store = createStore()
store.setter(setSelectionBoundsAtom, { rowCount: 4, colCount: 4 })

function coordinateAt(event: ReactPointerEvent<HTMLElement>): CellCoord | null {
  const target = document.elementFromPoint(event.clientX, event.clientY)
  const cell = target?.closest<HTMLElement>('td[data-cell]')
  const [row, col] = cell?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function ControlledGrid() {
  const selection = useSpreadsheetSelection()
  const pointerHandlers = useSpreadsheetPointerSelection({
    sheetId: 'fixture-sheet',
    getCellCoord: coordinateAt,
  })
  const { colEnd, colStart, rowEnd, rowStart } = selection.range

  return (
    <main>
      <section
        aria-label="Controlled spreadsheet grid"
        data-testid="react-controlled-grid"
        {...pointerHandlers}
      >
        <SpreadsheetGridView cells={GRID_CELLS} selected={selection.range} window={GRID_WINDOW} />
      </section>
      <output data-testid="selection-range">
        {`${rowStart}:${colStart}..${rowEnd}:${colEnd}`}
      </output>
    </main>
  )
}

const root = document.getElementById('root')
if (root === null) throw new Error('Missing fixture root element')

createRoot(root).render(
  <SpreadsheetUiProvider backend={deterministicBackend} store={store}>
    <ControlledGrid />
  </SpreadsheetUiProvider>,
)
