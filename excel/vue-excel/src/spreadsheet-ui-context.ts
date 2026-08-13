import type { SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'
import { inject, type ComputedRef, type InjectionKey } from 'vue'

/** Holds the reactive spreadsheet core supplied by the nearest Vue provider. */
export const SpreadsheetUiContext: InjectionKey<ComputedRef<SpreadsheetUiCore>> =
  Symbol('SpreadsheetUiContext')

/** Returns the spreadsheet core supplied by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetUiCore(): ComputedRef<SpreadsheetUiCore> {
  const core = inject(SpreadsheetUiContext)
  if (core === undefined) {
    throw new Error('useSpreadsheetUiCore must be used within a SpreadsheetUiProvider.')
  }
  return core
}
