import { createStore, type Store } from '@einfach/core'
import type { SpreadsheetBackend } from './backend'
import { bindSpreadsheetBackend } from './runtime/backend-state'

export interface SpreadsheetUiCoreOptions {
  backend: SpreadsheetBackend
  store?: Store
}

export interface SpreadsheetUiCore {
  backend: SpreadsheetBackend
  store: Store
}

export function createSpreadsheetUi(options: SpreadsheetUiCoreOptions): SpreadsheetUiCore {
  const store = options.store ?? createStore()
  bindSpreadsheetBackend(store, options.backend)
  return {
    backend: options.backend,
    store,
  }
}
