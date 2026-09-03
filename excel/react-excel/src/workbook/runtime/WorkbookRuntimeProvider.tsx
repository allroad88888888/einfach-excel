import type { Store } from '@einfach/core'
import { Provider as AtomProvider } from '@einfach/react'
import {
  createSpreadsheetUi,
  type RustWorkbookConnection,
} from '@einfach/spreadsheet-ui-core'
import { useMemo, type ReactNode } from 'react'

export interface WorkbookRuntimeProviderProps {
  connection: RustWorkbookConnection
  children: ReactNode
  store?: Store
}

/** Supplies an isolated spreadsheet core to a React subtree. */
export function WorkbookRuntimeProvider({
  connection,
  children,
  store,
}: WorkbookRuntimeProviderProps): ReactNode {
  const core = useMemo(
    () => createSpreadsheetUi({ connection, store }),
    [connection, store],
  )

  return <AtomProvider store={core.store}>{children}</AtomProvider>
}
