import type { Store } from '@einfach/core'
import {
  createSpreadsheetUi,
  type SpreadsheetBackend,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { useMemo, type ReactNode } from 'react'
import { WorkbookRuntimeContext } from './use-workbook-runtime'

export interface WorkbookRuntimeProviderProps {
  backend: SpreadsheetBackend
  children: ReactNode
  store?: Store
}

function createCore(backend: SpreadsheetBackend, store: Store | undefined): SpreadsheetUiCore {
  return createSpreadsheetUi({ backend, store })
}

/** Supplies an isolated spreadsheet core to a React subtree. */
export function WorkbookRuntimeProvider({
  backend,
  children,
  store,
}: WorkbookRuntimeProviderProps): ReactNode {
  const core = useMemo(() => createCore(backend, store), [backend, store])

  return <WorkbookRuntimeContext.Provider value={core}>{children}</WorkbookRuntimeContext.Provider>
}
