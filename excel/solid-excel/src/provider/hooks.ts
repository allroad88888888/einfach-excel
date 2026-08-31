import type { Store } from '@einfach/core'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetUiCoreContext } from './context'

export function useSpreadsheetUiCore() {
  return useSpreadsheetUiCoreContext()
}

export function useSpreadsheetUiStore(): Store {
  return useSpreadsheetUiCore().store
}

export function useSpreadsheetBackend(): SpreadsheetBackend {
  return useSpreadsheetUiCore().backend
}
