import { atom } from '@einfach/core'
import { selectionAuthorityWitnessAtom } from '../selection'
import { workspaceActiveSheetAuthorityWitnessAtom } from '../workspace'
import {
  DEFAULT_GO_TO_LOCATOR,
  type GoToErrorDetails,
  type GoToLocator,
  type GoToMode,
  type GoToSpecialCapability,
  type GoToSpecialLifecycle,
  type GoToSpecialWarning,
} from './types'
import { snapshotLocator } from './value-snapshots'

/** Whether the dialog is shown. */
export const goToOpenAtom = atom<boolean>(false)
goToOpenAtom.debugLabel = 'spreadsheet.goTo.open'

/** Active dialog tab — simple Go To vs Go To Special. */
export const goToModeAtom = atom<GoToMode>('simple')
goToModeAtom.debugLabel = 'spreadsheet.goTo.mode'

/** Free-form text input for the simple-mode address / range / name field. */
export const goToInputAtom = atom<string>('')
goToInputAtom.debugLabel = 'spreadsheet.goTo.input'

/** Active radio in the Go To Special pane. */
export const goToLocatorAtom = atom<GoToLocator>(DEFAULT_GO_TO_LOCATOR)
goToLocatorAtom.debugLabel = 'spreadsheet.goTo.locator'

/**
 * Recent-jumps history (most recent first). Bounded at GO_TO_HISTORY_MAX
 * entries; duplicates are deduplicated (the existing slot moves to the
 * front).
 */
export const goToHistoryAtom = atom<readonly string[]>([])
goToHistoryAtom.debugLabel = 'spreadsheet.goTo.history'

export interface GoToSpecialScanState {
  status: 'idle' | 'scanning'
  sessionId: number
  requestId: number | null
  sheetId: string | null
  locator: GoToLocator | null
  workspaceWitness: unknown
  selectionWitness: unknown
}

export interface GoToSpecialReservation {
  sessionId: number
  workspaceWitness: unknown
  selectionWitness: unknown
}

export const EMPTY_GO_TO_ERROR: GoToErrorDetails = Object.freeze({
  code: null,
  params: null,
  message: null,
})

export const IDLE_SPECIAL_SCAN: GoToSpecialScanState = Object.freeze({
  status: 'idle',
  sessionId: 0,
  requestId: null,
  sheetId: null,
  locator: null,
  workspaceWitness: null,
  selectionWitness: null,
})

export const goToErrorStateAtom = atom<GoToErrorDetails>(EMPTY_GO_TO_ERROR)
goToErrorStateAtom.debugLabel = 'spreadsheet.goTo.internal.errorState'

export const goToSessionSequenceAtom = atom(0)
goToSessionSequenceAtom.debugLabel = 'spreadsheet.goTo.internal.sessionSequence'

export const goToSpecialRequestSequenceAtom = atom(0)
goToSpecialRequestSequenceAtom.debugLabel = 'spreadsheet.goTo.internal.specialRequestSequence'

export const goToSpecialScanStateAtom = atom<GoToSpecialScanState>(IDLE_SPECIAL_SCAN)
goToSpecialScanStateAtom.debugLabel = 'spreadsheet.goTo.internal.specialScanState'

export const goToSpecialReservationAtom = atom<GoToSpecialReservation | null>(null)
goToSpecialReservationAtom.debugLabel = 'spreadsheet.goTo.internal.specialReservation'

export const goToSpecialCapabilityStateAtom = atom<GoToSpecialCapability>('unknown')
goToSpecialCapabilityStateAtom.debugLabel = 'spreadsheet.goTo.internal.specialCapability'

export const goToSpecialWarningStateAtom = atom<GoToSpecialWarning | null>(null)
goToSpecialWarningStateAtom.debugLabel = 'spreadsheet.goTo.internal.specialWarning'

/**
 * Last error code surfaced by `confirmGoToAtom` — `null` when the previous
 * commit succeeded. The Solid dialog binds this for the inline error band.
 */
export const goToErrorAtom = atom(
  (get) => get(goToErrorStateAtom).code,
  (_get, set, code: string | null) => {
    set(
      goToErrorStateAtom,
      code === null ? EMPTY_GO_TO_ERROR : Object.freeze({ code, params: null, message: null }),
    )
  },
)
goToErrorAtom.debugLabel = 'spreadsheet.goTo.error'

export const goToErrorParamsAtom = atom((get) => get(goToErrorStateAtom).params)
goToErrorParamsAtom.debugLabel = 'spreadsheet.goTo.errorParams'

export const goToErrorMessageAtom = atom((get) => get(goToErrorStateAtom).message)
goToErrorMessageAtom.debugLabel = 'spreadsheet.goTo.errorMessage'

export const goToSpecialCapabilityAtom = atom((get) => get(goToSpecialCapabilityStateAtom))
goToSpecialCapabilityAtom.debugLabel = 'spreadsheet.goTo.specialCapability'

export const goToSpecialPendingAtom = atom((get) => {
  const reservation = get(goToSpecialReservationAtom)
  return (
    reservation !== null &&
    get(goToOpenAtom) &&
    get(goToModeAtom) === 'special' &&
    reservation.sessionId === get(goToSessionSequenceAtom) &&
    reservation.workspaceWitness === get(workspaceActiveSheetAuthorityWitnessAtom) &&
    reservation.selectionWitness === get(selectionAuthorityWitnessAtom)
  )
})
goToSpecialPendingAtom.debugLabel = 'spreadsheet.goTo.specialPending'

export const goToSpecialWarningAtom = atom((get) => get(goToSpecialWarningStateAtom))
goToSpecialWarningAtom.debugLabel = 'spreadsheet.goTo.specialWarning'

export const goToSpecialLifecycleAtom = atom((get): GoToSpecialLifecycle => {
  const sessionId = get(goToSessionSequenceAtom)
  const capability = get(goToSpecialCapabilityStateAtom)
  if (!get(goToOpenAtom)) {
    return Object.freeze({ phase: 'closed', sessionId, capability })
  }
  const scan = get(goToSpecialScanStateAtom)
  if (
    scan.status === 'scanning' &&
    scan.sessionId === sessionId &&
    scan.requestId !== null &&
    scan.sheetId !== null &&
    scan.locator !== null &&
    scan.workspaceWitness === get(workspaceActiveSheetAuthorityWitnessAtom) &&
    scan.selectionWitness === get(selectionAuthorityWitnessAtom)
  ) {
    return Object.freeze({
      phase: 'scanning',
      sessionId,
      requestId: scan.requestId,
      sheetId: scan.sheetId,
      locator: snapshotLocator(scan.locator),
      capability,
    })
  }
  const mode = get(goToModeAtom)
  const warning = get(goToSpecialWarningStateAtom)
  if (mode === 'special' && warning !== null) {
    return Object.freeze({ phase: 'open-warning', sessionId, capability, mode, warning })
  }
  const error = get(goToErrorStateAtom)
  if (error.code !== null || error.message !== null) {
    return Object.freeze({ phase: 'open-error', sessionId, capability, mode, error })
  }
  return Object.freeze({ phase: 'open', sessionId, capability, mode })
})
goToSpecialLifecycleAtom.debugLabel = 'spreadsheet.goTo.specialLifecycle'
