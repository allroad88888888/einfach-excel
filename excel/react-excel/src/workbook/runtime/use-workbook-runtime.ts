import { createContext, useContext } from 'react'
import type { SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'

/** Holds the workbook core owned by the nearest product runtime provider. */
export const WorkbookRuntimeContext = createContext<SpreadsheetUiCore | undefined>(undefined)

/** Returns the workbook core supplied by the product runtime provider. */
export function useWorkbookRuntime(): SpreadsheetUiCore {
  const core = useContext(WorkbookRuntimeContext)
  if (core === undefined) {
    throw new Error('useWorkbookRuntime must be used within a WorkbookRuntimeProvider.')
  }
  return core
}
