import { atom } from '@einfach/core'
import type {
  CellCoord,
  CellRange,
  FilterSortEntrypoint,
  FilterSortEntrypointTarget,
  SortDirection,
} from '@einfach/spreadsheet-ui-core'

export const SORT_RANGE_UNAVAILABLE_ERROR =
  'The sortable data range could not be determined. Check the sheet data and try again.'

export type SortConfirmationEntrypoint = FilterSortEntrypoint

interface SortConfirmationContext {
  readonly active: CellCoord
  readonly attempt: number
  readonly direction: SortDirection
  readonly entrypoint: SortConfirmationEntrypoint
  readonly sessionId: number
  readonly target: FilterSortEntrypointTarget
}

export type SortConfirmationState =
  | { readonly status: 'closed' }
  | (SortConfirmationContext & { readonly status: 'preparing' })
  | (SortConfirmationContext & { readonly status: 'ready'; readonly range: CellRange })
  | (SortConfirmationContext & { readonly status: 'error'; readonly error: string })

export type SortConfirmationTicket = SortConfirmationContext & { readonly status: 'preparing' }

interface BeginSortConfirmationInput {
  readonly active: CellCoord
  readonly direction: SortDirection
  readonly entrypoint: SortConfirmationEntrypoint
  readonly target: FilterSortEntrypointTarget
}

type SettleSortConfirmationInput =
  | { readonly sessionId: number; readonly range: CellRange }
  | { readonly sessionId: number; readonly error: string }

const closedState = (): SortConfirmationState => Object.freeze({ status: 'closed' })

const sortConfirmationBackingAtom = atom<SortConfirmationState>(closedState())
const sortConfirmationSequenceAtom = atom(0)

export const sortConfirmationAtom = atom((get) => get(sortConfirmationBackingAtom))
sortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation'

function nextSessionId(current: number): number | null {
  return Number.isSafeInteger(current) && current >= 0 && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : null
}

function preparingState(
  sessionId: number,
  attempt: number,
  input: BeginSortConfirmationInput,
): SortConfirmationTicket {
  return Object.freeze({
    status: 'preparing',
    sessionId,
    attempt,
    direction: input.direction,
    entrypoint: input.entrypoint,
    target: Object.freeze({ ...input.target }),
    active: Object.freeze({ ...input.active }),
  })
}

export const beginSortConfirmationAtom = atom(
  null,
  (get, set, input: BeginSortConfirmationInput): SortConfirmationTicket | null => {
    const sessionId = nextSessionId(get(sortConfirmationSequenceAtom))
    if (sessionId === null) return null
    const state = preparingState(sessionId, 1, input)
    set(sortConfirmationSequenceAtom, sessionId)
    set(sortConfirmationBackingAtom, state)
    return state
  },
)
beginSortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation.begin'

export const settleSortConfirmationAtom = atom(
  null,
  (get, set, input: SettleSortConfirmationInput): void => {
    const current = get(sortConfirmationBackingAtom)
    if (current.status !== 'preparing' || current.sessionId !== input.sessionId) return
    if ('range' in input) {
      set(
        sortConfirmationBackingAtom,
        Object.freeze({ ...current, status: 'ready', range: Object.freeze({ ...input.range }) }),
      )
      return
    }
    set(
      sortConfirmationBackingAtom,
      Object.freeze({ ...current, status: 'error', error: input.error }),
    )
  },
)
settleSortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation.settle'

export const retrySortConfirmationAtom = atom(null, (get, set): SortConfirmationTicket | null => {
  const current = get(sortConfirmationBackingAtom)
  if (current.status !== 'error') return null
  const sessionId = nextSessionId(get(sortConfirmationSequenceAtom))
  if (sessionId === null) return null
  const state = preparingState(sessionId, current.attempt + 1, current)
  set(sortConfirmationSequenceAtom, sessionId)
  set(sortConfirmationBackingAtom, state)
  return state
})
retrySortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation.retry'

export const consumeSortConfirmationAtom = atom(
  null,
  (get, set): Extract<SortConfirmationState, { readonly status: 'ready' }> | null => {
    const current = get(sortConfirmationBackingAtom)
    if (current.status !== 'ready') return null
    set(sortConfirmationBackingAtom, closedState())
    return current
  },
)
consumeSortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation.consume'

export const closeSortConfirmationAtom = atom(null, (_get, set): void => {
  set(sortConfirmationBackingAtom, closedState())
})
closeSortConfirmationAtom.debugLabel = 'spreadsheet.host.sortConfirmation.close'
