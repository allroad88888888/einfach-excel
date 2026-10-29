import type { atom, AtomEntity } from '@einfach/core'
import type { CellRange } from '../shared'
import type {
  FormatCellsSaveAttempt,
  FormatCellsSavePhase,
  FormatCellsSaveRequest,
  FormatCellsSaveResult,
  RunFormatCellsSaveInput,
} from './types'
import { sameRange } from './format-save-validation'

export interface SaveOpenState {
  readonly status: 'open'
  readonly sheetId: string
  readonly range: CellRange
  readonly sessionId: number
  readonly phase: FormatCellsSavePhase
  readonly requestId: number | null
  readonly pending: boolean
  readonly error: string | null
}

export interface SaveLaunch {
  readonly token: object
  readonly operationId: string
  readonly sessionId: number
  readonly requestId: number
  readonly reentered: boolean
  readonly launched: boolean
  readonly sensitive: boolean
}

export interface SaveController {
  readonly runAtom: ReturnType<
    typeof atom<null, [RunFormatCellsSaveInput?], Promise<FormatCellsSaveResult>>
  >
  readonly ledgerAtom: AtomEntity<readonly FormatCellsSaveAttempt[]>
  readonly blockedAtom: AtomEntity<boolean>
}

export const FORMAT_CELLS_SAVE_LEDGER_MAX = 32

export function nextSafeIdentity(current: number): number | null {
  if (!Number.isSafeInteger(current) || current >= Number.MAX_SAFE_INTEGER) return null
  return current + 1
}

export function reserveLedgerSlot(
  ledger: readonly FormatCellsSaveAttempt[],
): FormatCellsSaveAttempt[] | null {
  const next = [...ledger]
  while (next.length >= FORMAT_CELLS_SAVE_LEDGER_MAX) {
    const acknowledgedIndex = next.findIndex((attempt) => attempt.status === 'local-acknowledged')
    if (acknowledgedIndex < 0) return null
    next.splice(acknowledgedIndex, 1)
  }
  return next
}

export function settleLedger(
  ledger: readonly FormatCellsSaveAttempt[],
  operationId: string,
  status: 'local-acknowledged' | 'outcome-unknown',
  error?: string,
): readonly FormatCellsSaveAttempt[] {
  return Object.freeze(
    ledger.map((attempt) =>
      attempt.operationId === operationId && attempt.status === 'pending'
        ? Object.freeze({ ...attempt, status, ...(error === undefined ? {} : { error }) })
        : attempt,
    ),
  )
}

export function matchesOwnedState<State extends SaveOpenState | { readonly status: 'closed' }>(
  state: State,
  request: FormatCellsSaveRequest,
): state is Extract<State, SaveOpenState> {
  return (
    state.status === 'open' &&
    state.pending &&
    state.sheetId === request.sheetId &&
    state.sessionId === request.sessionId &&
    state.requestId === request.requestId &&
    sameRange(state.range, request.range)
  )
}
