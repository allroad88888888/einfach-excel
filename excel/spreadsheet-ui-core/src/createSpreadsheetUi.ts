import { createStore, type Store } from '@einfach/core'
import type { RustWorkbookConnection } from './rust-workbook'
import { setRustWorkbookConnectionAtom } from './runtime/workbook-connection'

export interface SpreadsheetUiCoreOptions {
  connection: RustWorkbookConnection
  store?: Store
}

export interface SpreadsheetUiCore {
  connection: RustWorkbookConnection
  store: Store
}

export function createSpreadsheetUi(options: SpreadsheetUiCoreOptions): SpreadsheetUiCore {
  const store = options.store ?? createStore()
  store.setter(setRustWorkbookConnectionAtom, options.connection)
  return {
    connection: options.connection,
    store,
  }
}
