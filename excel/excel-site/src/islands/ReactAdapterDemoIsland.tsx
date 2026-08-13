/** @jsxImportSource react */

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
import type { PointerEvent as ReactPointerEvent } from 'react'
import './react-adapter-demo.css'

interface ReactAdapterDemoIslandProps {
  locale: 'en' | 'zh'
}

const GRID_WINDOW = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }
const GRID_CELLS: readonly DisplayCell[] = Array.from({ length: 16 }, (_, index) => ({
  row: Math.floor(index / 4),
  col: index % 4,
  displayValue: `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`,
}))

const unsupportedBackendOperation = (): never => {
  throw new Error('The React demo does not fetch or mutate a backend.')
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

function ControlledReactGrid({ locale }: ReactAdapterDemoIslandProps) {
  const selection = useSpreadsheetSelection()
  const pointerHandlers = useSpreadsheetPointerSelection({
    sheetId: 'react-demo-sheet',
    getCellCoord: coordinateAt,
  })
  const { colEnd, colStart, rowEnd, rowStart } = selection.range
  const instruction =
    locale === 'zh' ? '在单元格间拖动以选择范围。' : 'Drag across cells to select a range.'
  const selectionLabel = locale === 'zh' ? '当前选择：' : 'Current selection:'

  return (
    <section className="demo-island react-adapter-demo" data-runtime="static">
      <aside
        className="demo-runtime-note"
        aria-label={locale === 'zh' ? '演示运行时' : 'Demo runtime'}
      >
        <strong>{locale === 'zh' ? '受控本地投影' : 'Controlled local projection'}</strong>
        <span>
          {locale === 'zh'
            ? '调用方提供固定网格、确定性 backend 和隔离的 Einfach store。'
            : 'The caller supplies fixed cells, a deterministic backend, and an isolated Einfach store.'}
        </span>
      </aside>
      <p className="react-adapter-demo-instruction">{instruction}</p>
      <div
        aria-label={
          locale === 'zh' ? 'React 受控电子表格网格' : 'React controlled spreadsheet grid'
        }
        className="react-adapter-demo-grid"
        data-testid="react-controlled-grid"
        {...pointerHandlers}
      >
        <SpreadsheetGridView cells={GRID_CELLS} selected={selection.range} window={GRID_WINDOW} />
      </div>
      <p className="react-adapter-demo-selection">
        {selectionLabel}{' '}
        <output data-testid="selection-range">{`${rowStart}:${colStart}..${rowEnd}:${colEnd}`}</output>
      </p>
    </section>
  )
}

/** Renders a fixed React adapter projection without invoking backend operations. */
export default function ReactAdapterDemoIsland({ locale }: ReactAdapterDemoIslandProps) {
  return (
    <SpreadsheetUiProvider backend={deterministicBackend} store={store}>
      <ControlledReactGrid locale={locale} />
    </SpreadsheetUiProvider>
  )
}
