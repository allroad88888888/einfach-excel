import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

export type CalculationMode = 'automatic' | 'manual'

export const calculationModeStateAtom = atom<{
  readonly connection: RustWorkbookConnection | null
  readonly mode: CalculationMode
} | null>(null)
calculationModeStateAtom.debugLabel = 'spreadsheet.calculation.mode.state'

export const hydrateCalculationModeAtom = atom(
  null,
  (get, set, mode: CalculationMode | undefined): void => {
    if (mode !== 'automatic' && mode !== 'manual') return
    const connection = get(rustWorkbookConnectionAtom)
    const saved = get(calculationModeStateAtom)
    if (saved?.connection === connection && saved.mode === mode) return
    set(calculationModeStateAtom, Object.freeze({ connection, mode }))
  },
)
hydrateCalculationModeAtom.debugLabel = 'spreadsheet.calculation.hydrateMode'
