import { createStore } from '@einfach/core'
import { Provider as AtomProvider, useAtomValue, useSetAtom } from '@einfach/react'
import {
  beginSpreadsheetRuntimeAtom,
  rejectSpreadsheetRuntimeAtom,
  resolveSpreadsheetRuntimeAtom,
  setSelectionBoundsAtom,
  spreadsheetRuntimeAtom,
} from '@einfach/spreadsheet-ui-core'
import { useEffect } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../product/sales-orders/data/sheet'
import { createRustWorkbookBackend } from '../product/sales-orders/runtime/create-rust-workbook-backend'
import { Workbook } from '../workbook/shell/Workbook'

const workbookStore = createStore()
workbookStore.setter(setSelectionBoundsAtom, {
  colCount: SALES_ORDER_COLUMNS.length,
  rowCount: SALES_ORDER_SHEET_ROW_COUNT,
})

type RustWorkbookBackend = ReturnType<typeof createRustWorkbookBackend>

/** Owns the Rust Worker resource while core owns its rendered lifecycle state. */
function ProductWorkbookRuntime() {
  const state = useAtomValue(spreadsheetRuntimeAtom)
  const beginRuntime = useSetAtom(beginSpreadsheetRuntimeAtom)
  const rejectRuntime = useSetAtom(rejectSpreadsheetRuntimeAtom)
  const resolveRuntime = useSetAtom(resolveSpreadsheetRuntimeAtom)

  useEffect(() => {
    let active = true
    let backend: RustWorkbookBackend | undefined
    let disposed = false
    const disposeBackend = () => {
      if (backend === undefined || disposed) return
      disposed = true
      backend.dispose()
    }

    beginRuntime()

    try {
      backend = createRustWorkbookBackend()
    } catch (error) {
      rejectRuntime(error)
      return () => {
        active = false
        beginRuntime()
      }
    }

    void backend.ready().then(
      () => {
        if (active && backend !== undefined) resolveRuntime({ backend })
      },
      (error: unknown) => {
        disposeBackend()
        if (active) rejectRuntime(error)
      },
    )

    return () => {
      active = false
      disposeBackend()
      beginRuntime()
    }
  }, [beginRuntime, rejectRuntime, resolveRuntime])

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

  return <Workbook />
}

/** Opens the Rust workbook and supplies its explicit product store. */
export function App() {
  return (
    <AtomProvider store={workbookStore}>
      <ProductWorkbookRuntime />
    </AtomProvider>
  )
}
