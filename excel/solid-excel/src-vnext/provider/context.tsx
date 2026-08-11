import { createContext, useContext } from 'solid-js'
import type { SpreadsheetUiCore } from './types'

/** Context owns the stable runtime workbook port for this Provider subtree. */
export const SpreadsheetUiContext = createContext<SpreadsheetUiCore | undefined>(undefined)

/** @deprecated Use `useSpreadsheetUiCore` instead. */
export function useSpreadsheetUiCoreContext(): SpreadsheetUiCore {
  const core = useContext(SpreadsheetUiContext)
  if (!core) throw new Error('SpreadsheetUiProvider is required.')
  return core
}
