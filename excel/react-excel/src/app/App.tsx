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
import { createSalesOrdersWorkbookConnection } from '../product/sales-orders/runtime/create-rust-workbook-connection'
import { initializeSalesOrdersWorkbook } from '../product/sales-orders/runtime/initialize-sales-orders-workbook'
import { Workbook } from '../workbook/shell/Workbook'

const workbookStore = createStore()
workbookStore.setter(setSelectionBoundsAtom, {
  colCount: SALES_ORDER_COLUMNS.length,
  rowCount: SALES_ORDER_SHEET_ROW_COUNT,
})

type RustWorkbookConnection = ReturnType<typeof createSalesOrdersWorkbookConnection>

/** Owns the Rust Worker resource while core owns its rendered lifecycle state. */
function ProductWorkbookRuntime() {
  const state = useAtomValue(spreadsheetRuntimeAtom)
  const beginRuntime = useSetAtom(beginSpreadsheetRuntimeAtom)
  const rejectRuntime = useSetAtom(rejectSpreadsheetRuntimeAtom)
  const resolveRuntime = useSetAtom(resolveSpreadsheetRuntimeAtom)

  useEffect(() => {
    let active = true
    let connection: RustWorkbookConnection | undefined
    let disposed = false
    const disposeConnection = () => {
      if (connection === undefined || disposed) return
      disposed = true
      connection.dispose()
    }

    beginRuntime()

    try {
      connection = createSalesOrdersWorkbookConnection()
    } catch (error) {
      rejectRuntime(error)
      return () => {
        active = false
        beginRuntime()
      }
    }

    void initializeSalesOrdersWorkbook(connection).then(
      () => {
        if (active && connection !== undefined) resolveRuntime({ connection })
      },
      (error: unknown) => {
        disposeConnection()
        if (active) rejectRuntime(error)
      },
    )

    return () => {
      active = false
      disposeConnection()
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
