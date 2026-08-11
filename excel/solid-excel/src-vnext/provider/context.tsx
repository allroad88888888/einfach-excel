import { createContext } from 'solid-js'
import type { SpreadsheetUiCore } from './types'
import { useSpreadsheetUiCore } from './hooks'

/**
 * @deprecated Kept as an export compatibility marker. Workbook state is no
 * longer injected through this context; use `useSpreadsheetUiCore` instead.
 */
export const SpreadsheetUiContext = createContext<SpreadsheetUiCore | undefined>(undefined)

/** @deprecated Use `useSpreadsheetUiCore` instead. */
export function useSpreadsheetUiCoreContext(): SpreadsheetUiCore {
  return useSpreadsheetUiCore()
}
