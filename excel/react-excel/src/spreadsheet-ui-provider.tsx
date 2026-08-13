import type { Store } from '@einfach/core'
import {
  createSpreadsheetUi,
  type SpreadsheetBackend,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { useMemo, type ReactNode } from 'react'
import { SpreadsheetUiContext } from './spreadsheet-ui-context'

export interface SpreadsheetUiProviderProps {
  backend: SpreadsheetBackend
  children: ReactNode
  store?: Store
}

function createCore(backend: SpreadsheetBackend, store: Store | undefined): SpreadsheetUiCore {
  return createSpreadsheetUi({ backend, store })
}

/** Supplies an isolated spreadsheet core to a React subtree. */
export function SpreadsheetUiProvider({
  backend,
  children,
  store,
}: SpreadsheetUiProviderProps): ReactNode {
  const core = useMemo(() => createCore(backend, store), [backend, store])

  return <SpreadsheetUiContext.Provider value={core}>{children}</SpreadsheetUiContext.Provider>
}
