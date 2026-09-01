import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
} from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetUiProvider,
  useSpreadsheetSelection,
} from '@einfach/react-excel'
import { useEffect, useState } from 'react'
import { DemoGrid } from './DemoGrid'
import {
  DEMO_COLUMNS,
  DEMO_DATA_ROW_COUNT,
  DEMO_SHEET_ROW_COUNT,
  getDemoFormulaBarValue,
} from './demo-data'
import { FormulaBar } from './FormulaBar'
import { WorkbookFooter } from './WorkbookFooter'
import { WorkbookHeader } from './WorkbookHeader'
import { WorkbookRibbon } from './WorkbookRibbon'
import { createRustDemoBackend } from './rust-demo-backend'

const demoStore = createStore()
demoStore.setter(setSelectionBoundsAtom, {
  colCount: DEMO_COLUMNS.length,
  rowCount: DEMO_SHEET_ROW_COUNT,
})

function columnLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

function selectionLabel(range: {
  colEnd: number
  colStart: number
  rowEnd: number
  rowStart: number
}): string {
  const start = `${columnLabel(range.colStart)}${range.rowStart + 1}`
  const end = `${columnLabel(range.colEnd)}${range.rowEnd + 1}`
  return start === end ? start : `${start}:${end}`
}

function Workbook() {
  const selection = useSpreadsheetSelection()
  const address = selectionLabel(selection.range)
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <div className="workbook" data-runtime-state="ready">
      <WorkbookHeader />
      <div
        role="status"
        style={{
          background: 'var(--primary-soft)',
          color: 'var(--primary-strong)',
          fontSize: 11,
          padding: '4px 12px',
        }}
      >
        Rust/WASM ready
      </div>
      <WorkbookRibbon />
      <FormulaBar
        address={address}
        value={getDemoFormulaBarValue(selection.range.rowStart, selection.range.colStart)}
      />
      <DemoGrid />
      <WorkbookFooter
        recordCount={DEMO_DATA_ROW_COUNT}
        selectedCellCount={selectedCellCount}
      />
    </div>
  )
}

type RustDemoBackend = ReturnType<typeof createRustDemoBackend>
type WorkbookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; backend: RustDemoBackend }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Rust workbook error.'
}

/** Composes the standalone React adapter demo. */
export function App() {
  const [state, setState] = useState<WorkbookState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let backend: RustDemoBackend

    try {
      backend = createRustDemoBackend()
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
      return () => {
        active = false
      }
    }

    void backend.ready().then(
      () => {
        if (active) setState({ status: 'ready', backend })
      },
      (error: unknown) => {
        backend.dispose()
        if (active) setState({ status: 'error', message: errorMessage(error) })
      },
    )

    return () => {
      active = false
      backend.dispose()
    }
  }, [])

  if (state.status === 'loading') {
    return <main role="status">Loading Rust/WASM workbook…</main>
  }
  if (state.status === 'error') {
    return (
      <main role="alert">
        <h1>Workbook failed to open</h1>
        <p>{state.message}</p>
      </main>
    )
  }

  return (
    <SpreadsheetUiProvider backend={state.backend} store={demoStore}>
      <Workbook />
    </SpreadsheetUiProvider>
  )
}
