import { createStore } from '@einfach/core'
import { setSelectionBoundsAtom } from '@einfach/spreadsheet-ui-core'
import { useEffect, useState } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../product/sales-orders/data/sheet'
import { createRustWorkbookBackend } from '../product/sales-orders/runtime/create-rust-workbook-backend'
import { WorkbookRuntimeProvider } from '../workbook/runtime/WorkbookRuntimeProvider'
import { Workbook } from '../workbook/shell/Workbook'

const workbookStore = createStore()
workbookStore.setter(setSelectionBoundsAtom, {
  colCount: SALES_ORDER_COLUMNS.length,
  rowCount: SALES_ORDER_SHEET_ROW_COUNT,
})

type RustWorkbookBackend = ReturnType<typeof createRustWorkbookBackend>
type WorkbookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; backend: RustWorkbookBackend }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Rust workbook error.'
}

/** Opens the Rust workbook and owns the product runtime boundary. */
export function App() {
  const [state, setState] = useState<WorkbookState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let backend: RustWorkbookBackend

    try {
      backend = createRustWorkbookBackend()
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
    <WorkbookRuntimeProvider backend={state.backend} store={workbookStore}>
      <Workbook />
    </WorkbookRuntimeProvider>
  )
}
