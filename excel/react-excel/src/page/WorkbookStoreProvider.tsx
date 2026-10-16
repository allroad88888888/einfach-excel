import { createStore, type Store } from '@einfach/core'
import { Provider as AtomProvider } from '@einfach/react'
import { createSpreadsheetUi, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { useMemo, type ReactNode } from 'react'
import { I18nProvider } from '@lingui/react'
import { i18n } from '../i18n/runtime'

export interface WorkbookStoreProviderProps {
  readonly children: ReactNode
  readonly connection?: RustWorkbookConnection
  readonly store?: Store
}

/** Supplies an explicitly configured workbook store to controlled React consumers. */
export function WorkbookStoreProvider({
  children,
  connection,
  store,
}: WorkbookStoreProviderProps): ReactNode {
  const runtimeStore = useMemo(() => {
    if (connection !== undefined) {
      return createSpreadsheetUi({ connection, store }).store
    }
    return store ?? createStore()
  }, [connection, store])

  return (
    <I18nProvider i18n={i18n}>
      <AtomProvider store={runtimeStore}>{children}</AtomProvider>
    </I18nProvider>
  )
}
