import { atom } from '@einfach/core'
import {
  EMPTY_GO_TO_ERROR,
  IDLE_SPECIAL_SCAN,
  goToErrorAtom,
  goToErrorStateAtom,
  goToHistoryAtom,
  goToInputAtom,
  goToLocatorAtom,
  goToModeAtom,
  goToOpenAtom,
  goToSessionSequenceAtom,
  goToSpecialCapabilityStateAtom,
  goToSpecialReservationAtom,
  goToSpecialScanStateAtom,
  goToSpecialWarningStateAtom,
} from './session-state'
import { nextGoToSessionId } from './identity'
import {
  GO_TO_HISTORY_MAX,
  type GoToErrorDetails,
  type GoToLocator,
  type GoToMode,
  type GoToSpecialCapability,
} from './types'
import {
  explicitSpecialError,
  snapshotError,
  snapshotLocator,
  unavailableSpecialError,
} from './value-snapshots'

export const openGoToAtom = atom(
  (get) => get(goToOpenAtom),
  (get, set) => {
    const sessionId = nextGoToSessionId(get(goToSessionSequenceAtom))
    if (sessionId === null) {
      set(goToOpenAtom, false)
      set(goToSpecialWarningStateAtom, null)
      set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
      set(goToSpecialReservationAtom, null)
      set(
        goToErrorStateAtom,
        explicitSpecialError(
          'goTo.error.identityExhausted',
          'Go To cannot open because its session identity space is exhausted.',
        ),
      )
      return
    }
    set(goToSessionSequenceAtom, sessionId)
    set(goToOpenAtom, true)
    set(goToModeAtom, 'simple')
    set(goToInputAtom, '')
    set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
    set(goToSpecialWarningStateAtom, null)
    set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
    set(goToSpecialReservationAtom, null)
  },
)
openGoToAtom.debugLabel = 'spreadsheet.goTo.openCommand'

export const closeGoToAtom = atom(
  (get) => get(goToOpenAtom),
  (get, set) => {
    const sessionId = nextGoToSessionId(get(goToSessionSequenceAtom))
    if (sessionId !== null) {
      set(goToSessionSequenceAtom, sessionId)
    }
    set(goToOpenAtom, false)
    set(
      goToErrorStateAtom,
      sessionId === null
        ? explicitSpecialError(
            'goTo.error.identityExhausted',
            'Go To closed because its session identity space is exhausted.',
          )
        : EMPTY_GO_TO_ERROR,
    )
    set(goToInputAtom, '')
    set(goToSpecialWarningStateAtom, null)
    set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
    set(goToSpecialReservationAtom, null)
  },
)
closeGoToAtom.debugLabel = 'spreadsheet.goTo.close'

export const setGoToModeAtom = atom(
  (get) => get(goToModeAtom),
  (get, set, mode: GoToMode) => {
    set(goToModeAtom, mode)
    set(goToSpecialWarningStateAtom, null)
    set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
    set(goToSpecialReservationAtom, null)
    if (mode === 'special' && get(goToSpecialCapabilityStateAtom) === 'unavailable') {
      set(goToErrorStateAtom, unavailableSpecialError())
      return
    }
    set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
  },
)
setGoToModeAtom.debugLabel = 'spreadsheet.goTo.setMode'

export const setGoToInputAtom = atom(
  (get) => get(goToInputAtom),
  (_get, set, input: string) => {
    set(goToInputAtom, input)
    set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
  },
)
setGoToInputAtom.debugLabel = 'spreadsheet.goTo.setInput'

export const setGoToLocatorAtom = atom(
  (get) => get(goToLocatorAtom),
  (_get, set, locator: GoToLocator) => {
    set(goToLocatorAtom, snapshotLocator(locator))
    set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
    set(goToSpecialWarningStateAtom, null)
    set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
    set(goToSpecialReservationAtom, null)
  },
)
setGoToLocatorAtom.debugLabel = 'spreadsheet.goTo.setLocator'

/**
 * Push a (deduplicated) entry to the front of the recent-jumps list and
 * trim at GO_TO_HISTORY_MAX.
 */
export const pushGoToHistoryAtom = atom(null, (get, set, entry: string) => {
  const trimmed = entry.trim()
  if (trimmed.length === 0) return
  const existing = get(goToHistoryAtom)
  const filtered = existing.filter((e) => e.toLowerCase() !== trimmed.toLowerCase())
  const next = [trimmed, ...filtered].slice(0, GO_TO_HISTORY_MAX)
  set(goToHistoryAtom, next)
})
pushGoToHistoryAtom.debugLabel = 'spreadsheet.goTo.pushHistory'

export const setGoToErrorAtom = atom(
  (get) => get(goToErrorAtom),
  (_get, set, code: string | null) => {
    set(goToErrorAtom, code)
  },
)
setGoToErrorAtom.debugLabel = 'spreadsheet.goTo.setError'

export const setGoToErrorDetailsAtom = atom(
  (get) => get(goToErrorStateAtom),
  (_get, set, details: GoToErrorDetails) => {
    set(goToErrorStateAtom, snapshotError(details))
  },
)
setGoToErrorDetailsAtom.debugLabel = 'spreadsheet.goTo.setErrorDetails'

export const setGoToSpecialCapabilityAtom = atom(
  (get) => get(goToSpecialCapabilityStateAtom),
  (get, set, capability: GoToSpecialCapability) => {
    set(goToSpecialCapabilityStateAtom, capability)
    if (!get(goToOpenAtom) || get(goToModeAtom) !== 'special') return
    const error = get(goToErrorStateAtom)
    if (capability === 'unavailable') {
      set(goToErrorStateAtom, unavailableSpecialError())
    } else if (error.code === 'goTo.error.capabilityUnavailable') {
      set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
    }
  },
)
setGoToSpecialCapabilityAtom.debugLabel = 'spreadsheet.goTo.setSpecialCapability'
