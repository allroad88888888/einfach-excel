import type { Store } from '@einfach/core'
import { Provider as AtomProvider } from '@einfach/react'
import {
  createSpreadsheetUi,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { useMemo, type ReactNode } from 'react'

export interface WorkbookRuntimeProviderProps {
  backend: SpreadsheetBackend
  children: ReactNode
  store?: Store
}

/** Supplies an isolated spreadsheet core to a React subtree. */
export function WorkbookRuntimeProvider({
  backend,
  children,
  store,
}: WorkbookRuntimeProviderProps): ReactNode {
  const core = useMemo(() => createSpreadsheetUi({ backend, store }), [backend, store])

  return <AtomProvider store={core.store}>{children}</AtomProvider>
}
