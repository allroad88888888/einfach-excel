import type { Setter } from '@einfach/core'
import type { BackendMutationResult } from '../backend/types'
import type { CellRange } from '../shared'
import type {
  ReadSheetProtectionRequest,
  ReadSheetProtectionResult,
  SetRangeLockRequest,
  SetSheetProtectionRequest,
  SheetProtectionState,
} from './types'
import { protectionErrorMessage, sheetProtectionDiagnosticBackingAtom } from './source-atoms'

// --- persistence hook (optional; absence never degrades the feature) ---

export interface SheetProtectionPersistencePort {
  setSheetProtection?: (request: SetSheetProtectionRequest) => Promise<BackendMutationResult>
  setRangeLock?: (request: SetRangeLockRequest) => Promise<BackendMutationResult>
  readSheetProtection?: (request: ReadSheetProtectionRequest) => Promise<ReadSheetProtectionResult>
}

/** Fire-and-forget full-state mirror into `setSheetProtection` when present. */
export function persistProtectionState(
  set: Setter,
  source: unknown,
  sheetId: string,
  state: SheetProtectionState,
) {
  if (typeof source !== 'object' || source === null) return
  const persist = (source as SheetProtectionPersistencePort).setSheetProtection
  if (typeof persist !== 'function') return
  const recordFailure = (error: unknown) => {
    set(sheetProtectionDiagnosticBackingAtom, {
      kind: 'persist-failed',
      sheetId,
      message: protectionErrorMessage(error),
    })
  }
  try {
    void persist
      .call(source, {
        kind: 'set-sheet-protection',
        sheetId,
        mode: state.mode,
        unlockedRanges: state.unlockedRanges.map((range) => ({ ...range })),
      } satisfies SetSheetProtectionRequest)
      .catch(recordFailure)
  } catch (error) {
    recordFailure(error)
  }
}

/**
 * Fire-and-forget range-lock mirror. Prefers the granular `setRangeLock`
 * port; falls back to a full-state `setSheetProtection` mirror; silently
 * no-ops when the source exposes neither.
 */
export function persistRangeLock(
  set: Setter,
  source: unknown,
  sheetId: string,
  range: Readonly<CellRange>,
  locked: boolean,
  fullState: SheetProtectionState,
) {
  if (typeof source !== 'object' || source === null) return
  const port = source as SheetProtectionPersistencePort
  if (typeof port.setRangeLock !== 'function') {
    persistProtectionState(set, source, sheetId, fullState)
    return
  }
  const recordFailure = (error: unknown) => {
    set(sheetProtectionDiagnosticBackingAtom, {
      kind: 'persist-failed',
      sheetId,
      message: protectionErrorMessage(error),
    })
  }
  try {
    void port.setRangeLock
      .call(source, {
        kind: 'set-range-lock',
        sheetId,
        range: { ...range },
        locked,
      } satisfies SetRangeLockRequest)
      .catch(recordFailure)
  } catch (error) {
    recordFailure(error)
  }
}
