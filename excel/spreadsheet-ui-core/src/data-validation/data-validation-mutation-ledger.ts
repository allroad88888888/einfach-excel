import { atom, type Atom } from '@einfach/core'
import type {
  DataValidationMutationAcknowledgement,
  DataValidationOperationAttempt,
  DataValidationOperationAttemptStatus,
} from './types'
import { freezeLedgerFacade } from './data-validation-facade'
import type { CellRange } from '../shared'

export const DATA_VALIDATION_MUTATION_LEDGER_MAX = 32

export interface DataValidationMutationReservation {
  readonly sessionId: number
}

export interface DataValidationMutationAuthority {
  readonly sheetId: string
  readonly requestId: DataValidationOperationAttempt['requestId']
  readonly range: Readonly<CellRange>
}

export const dataValidationRequestSequenceAtom = atom(0)
export const dataValidationMutationReservationAtom = atom<DataValidationMutationReservation | null>(
  null,
)

/** Per-store launch barrier that flushes the complete start snapshot before transport. */
export const dataValidationTransportLaunchSequenceAtom = atom(0)

/** Local bounded evidence only; this is not the Stage 0.5 operation registry. */
export const dataValidationOperationAttemptLedgerStateAtom = atom<
  readonly DataValidationOperationAttempt[]
>(Object.freeze([]))
dataValidationOperationAttemptLedgerStateAtom.debugLabel =
  'spreadsheet.validation.operationAttemptLedgerState'

export const dataValidationOperationAttemptLedgerAtom: Atom<
  readonly DataValidationOperationAttempt[]
> = atom((get) => freezeLedgerFacade(get(dataValidationOperationAttemptLedgerStateAtom)))
dataValidationOperationAttemptLedgerAtom.debugLabel =
  'spreadsheet.validation.operationAttemptLedger'

/** Signals unresolved transport outcomes without claiming they were not applied. */
export const dataValidationMutationBlockedAtom = atom((get): boolean =>
  get(dataValidationOperationAttemptLedgerStateAtom).some(
    (attempt) => attempt.status === 'outcome-unknown',
  ),
)
dataValidationMutationBlockedAtom.debugLabel = 'spreadsheet.validation.mutationBlocked'

export function reserveAttemptSlot(
  ledger: readonly DataValidationOperationAttempt[],
): DataValidationOperationAttempt[] | null {
  const next = [...ledger]
  while (next.length >= DATA_VALIDATION_MUTATION_LEDGER_MAX) {
    const acknowledgedIndex = next.findIndex((attempt) => attempt.status === 'acknowledged')
    if (acknowledgedIndex < 0) return null
    next.splice(acknowledgedIndex, 1)
  }
  return next
}

export function settleAttempt(
  ledger: readonly DataValidationOperationAttempt[],
  operationId: string,
  status: DataValidationOperationAttemptStatus,
  detail: { error?: string; resultRevision?: DataValidationMutationAcknowledgement['revision'] },
): DataValidationOperationAttempt[] {
  return ledger.map((attempt) => {
    if (attempt.operationId !== operationId || attempt.status !== 'pending') return attempt
    return {
      ...attempt,
      status,
      ...(detail.error === undefined ? {} : { error: detail.error }),
      ...(detail.resultRevision === undefined ? {} : { resultRevision: detail.resultRevision }),
    }
  })
}
