import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import type { SheetProtectionBySheet, SheetProtectionState } from './types'
import { EMPTY_SHEET_PROTECTION, snapshotProtectionState } from './sheet-state'

// --- canonical source state ---

export const sheetProtectionSourceAtom = atom<SheetProtectionBySheet>(EMPTY_SHEET_PROTECTION)
sheetProtectionSourceAtom.debugLabel = 'spreadsheet.protection.source'

/** Read-only projection of the UI-core canonical protection state. Mutate via commands. */
export const sheetProtectionAtom: Atom<SheetProtectionBySheet> = atom((get) =>
  get(sheetProtectionSourceAtom),
)
sheetProtectionAtom.debugLabel = 'spreadsheet.protection.state'

// Sheets that are locally owned: either seeded once from the persistence
// hook or written by a local command. A late hydration result must never
// clobber a locally owned sheet. Bounded by the sheet count, same as the
// protection map itself.
export const sheetProtectionSeededSheetsAtom = atom<ReadonlySet<string>>(new Set<string>())
sheetProtectionSeededSheetsAtom.debugLabel = 'spreadsheet.protection.seededSheets'

export interface SheetProtectionDiagnostic {
  readonly kind: 'persist-failed' | 'hydrate-failed'
  readonly sheetId: string
  readonly message: string
}

export const sheetProtectionDiagnosticBackingAtom = atom<SheetProtectionDiagnostic | null>(null)
sheetProtectionDiagnosticBackingAtom.debugLabel = 'spreadsheet.protection.diagnosticBacking'

/** 工作簿连接被替换时回收旧投影；普通切表由原生返回事实重新发布。 */
export const resetSheetProtectionProjectionAtom = atom(null, (_get, set): void => {
  set(sheetProtectionSourceAtom, EMPTY_SHEET_PROTECTION)
  set(sheetProtectionSeededSheetsAtom, new Set<string>())
  set(sheetProtectionDiagnosticBackingAtom, null)
})

/** Read-only projection of the last persistence-hook failure. Local state is never rolled back. */
export const sheetProtectionDiagnosticAtom: Atom<SheetProtectionDiagnostic | null> = atom((get) =>
  get(sheetProtectionDiagnosticBackingAtom),
)
sheetProtectionDiagnosticAtom.debugLabel = 'spreadsheet.protection.diagnostic'

export type SheetProtectionCommandOutcome = 'committed' | 'unchanged' | 'invalid'

export function markSheetProtectionSeeded(get: Getter, set: Setter, sheetId: string) {
  const seeded = get(sheetProtectionSeededSheetsAtom)
  if (seeded.has(sheetId)) return
  const next = new Set(seeded)
  next.add(sheetId)
  set(sheetProtectionSeededSheetsAtom, next)
}

export function protectionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown transport failure.'
}

export function writeSheetProtection(
  get: Getter,
  set: Setter,
  sheetId: string,
  state: SheetProtectionState,
): SheetProtectionState {
  const snapshot = snapshotProtectionState(state)
  set(
    sheetProtectionSourceAtom,
    Object.freeze({ ...get(sheetProtectionSourceAtom), [sheetId]: snapshot }),
  )
  return snapshot
}
