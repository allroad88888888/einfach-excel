import { atom } from '@einfach/core'
import type { ReadSheetProtectionRequest, ReadSheetProtectionResult } from './types'
import { isValidProtectionState } from './sheet-state'
import {
  markSheetProtectionSeeded,
  protectionErrorMessage,
  sheetProtectionDiagnosticBackingAtom,
  sheetProtectionSeededSheetsAtom,
  writeSheetProtection,
} from './source-atoms'
import type { SheetProtectionPersistencePort } from './persistence'

// --- one-shot hydration seed ---

export interface HydrateSheetProtectionInput {
  readonly sheetId: string
  readonly source: SheetProtectionPersistencePort
}

export type HydrateSheetProtectionOutcome = 'hydrated' | 'skipped' | 'unsupported' | 'error'

let nextHydrateRequestId = 1

/**
 * One-shot seed from the optional persistence hook. Applies at most once
 * per sheet and never overwrites a sheet a local command already owns —
 * this is hydration, not authority.
 */
export const hydrateSheetProtectionAtom = atom(
  null,
  async (get, set, input: HydrateSheetProtectionInput): Promise<HydrateSheetProtectionOutcome> => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId) return 'error'
    const read = input.source?.readSheetProtection
    if (typeof read !== 'function') return 'unsupported'
    if (get(sheetProtectionSeededSheetsAtom).has(sheetId)) return 'skipped'

    let result: unknown
    try {
      result = await read.call(input.source, {
        kind: 'read-sheet-protection',
        sheetId,
        requestId: nextHydrateRequestId++,
      } satisfies ReadSheetProtectionRequest)
    } catch (error) {
      if (get(sheetProtectionSeededSheetsAtom).has(sheetId)) return 'skipped'
      set(sheetProtectionDiagnosticBackingAtom, {
        kind: 'hydrate-failed',
        sheetId,
        message: protectionErrorMessage(error),
      })
      return 'error'
    }
    // A local write while the read was in flight owns the sheet; discard the seed.
    if (get(sheetProtectionSeededSheetsAtom).has(sheetId)) return 'skipped'

    const payload = result as Partial<ReadSheetProtectionResult> | null | undefined
    if (
      typeof payload !== 'object' ||
      payload === null ||
      payload.sheetId !== sheetId ||
      !isValidProtectionState(payload.protection)
    ) {
      set(sheetProtectionDiagnosticBackingAtom, {
        kind: 'hydrate-failed',
        sheetId,
        message: 'Persistence hook returned an invalid protection payload.',
      })
      return 'error'
    }

    markSheetProtectionSeeded(get, set, sheetId)
    writeSheetProtection(get, set, sheetId, payload.protection)
    return 'hydrated'
  },
)
hydrateSheetProtectionAtom.debugLabel = 'spreadsheet.protection.hydrate'
