import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { TableDiagnostic, TableDiagnosticCode } from './table-messages'

// --- diagnostic + last-applied witness -------------------------------------

export const tableDiagnosticBackingAtom = atom<TableDiagnostic | null>(null)
tableDiagnosticBackingAtom.debugLabel = 'spreadsheet.tables.diagnosticBacking'

/** Read-only last table-command rejection, user-readable. Cleared on the next dispatch. */
export const tableDiagnosticAtom: Atom<TableDiagnostic | null> = atom((get) =>
  get(tableDiagnosticBackingAtom),
)
tableDiagnosticAtom.debugLabel = 'spreadsheet.tables.diagnostic'

export const clearTableDiagnosticAtom = atom(null, (_get, set) => {
  set(tableDiagnosticBackingAtom, null)
})
clearTableDiagnosticAtom.debugLabel = 'spreadsheet.tables.clearDiagnostic'

export const lastCreatedTableNameBackingAtom = atom<string | null>(null)
lastCreatedTableNameBackingAtom.debugLabel = 'spreadsheet.tables.lastCreatedNameBacking'

/** Read-only canonical name of the most recently created table (visible success witness). */
export const lastCreatedTableNameAtom: Atom<string | null> = atom((get) =>
  get(lastCreatedTableNameBackingAtom),
)
lastCreatedTableNameAtom.debugLabel = 'spreadsheet.tables.lastCreatedName'

export const lastToggledTableTotalsBackingAtom = atom<{ name: string; hasTotals: boolean } | null>(
  null,
)
lastToggledTableTotalsBackingAtom.debugLabel = 'spreadsheet.tables.lastToggledTotalsBacking'

/**
 * Read-only witness of the most recent applied totals-row toggle
 * (`{ name, hasTotals }`). The host surfaces `hasTotals` as a visible badge.
 */
export const lastToggledTableTotalsAtom: Atom<{ name: string; hasTotals: boolean } | null> = atom(
  (get) => get(lastToggledTableTotalsBackingAtom),
)
lastToggledTableTotalsAtom.debugLabel = 'spreadsheet.tables.lastToggledTotals'

export const lastRenamedTableBackingAtom = atom<{ from: string; to: string } | null>(null)
lastRenamedTableBackingAtom.debugLabel = 'spreadsheet.tables.lastRenamedBacking'

/** Read-only witness of the most recent applied rename (`{ from, to }`). */
export const lastRenamedTableAtom: Atom<{ from: string; to: string } | null> = atom((get) =>
  get(lastRenamedTableBackingAtom),
)
lastRenamedTableAtom.debugLabel = 'spreadsheet.tables.lastRenamed'

export const lastDeletedTableNameBackingAtom = atom<string | null>(null)
lastDeletedTableNameBackingAtom.debugLabel = 'spreadsheet.tables.lastDeletedNameBacking'

/** Read-only canonical name of the most recently deleted table (success witness). */
export const lastDeletedTableNameAtom: Atom<string | null> = atom((get) =>
  get(lastDeletedTableNameBackingAtom),
)
lastDeletedTableNameAtom.debugLabel = 'spreadsheet.tables.lastDeletedName'

export function setDiagnostic(
  set: (atomToSet: typeof tableDiagnosticBackingAtom, value: TableDiagnostic | null) => void,
  code: TableDiagnosticCode,
  message: string,
): void {
  set(tableDiagnosticBackingAtom, Object.freeze({ code, message }))
}
