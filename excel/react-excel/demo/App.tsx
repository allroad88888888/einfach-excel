import { createStore } from '@einfach/core'
import { setSelectionBoundsAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '@einfach/react-excel'
import { useEffect, useState } from 'react'
import {
  DEMO_COLUMNS,
  DEMO_SHEET_ROW_COUNT,
} from './demo-data'
import { createRustDemoBackend } from './rust-demo-backend'
import { RustWorksheet } from './RustWorksheet'

const demoStore = createStore()
demoStore.setter(setSelectionBoundsAtom, {
  colCount: DEMO_COLUMNS.length,
  rowCount: DEMO_SHEET_ROW_COUNT,
})

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
      <RustWorksheet />
    </SpreadsheetUiProvider>
  )
}
