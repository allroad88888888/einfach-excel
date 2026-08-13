import { createContext, useContext } from 'react'
import type { SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'

/** Holds the spreadsheet core owned by the nearest React provider. */
export const SpreadsheetUiContext = createContext<SpreadsheetUiCore | undefined>(undefined)

/** Returns the spreadsheet core supplied by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetUiCore(): SpreadsheetUiCore {
  const core = useContext(SpreadsheetUiContext)
  if (core === undefined) {
    throw new Error('useSpreadsheetUiCore must be used within a SpreadsheetUiProvider.')
  }
  return core
}
