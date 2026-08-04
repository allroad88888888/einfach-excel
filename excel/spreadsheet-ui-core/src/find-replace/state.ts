import { atom } from '@einfach/core'
import type { FindCursorState, FindReplaceCapability, FindReplaceFormState, FindReplaceQuery, ReplaceAllCapInfo } from './types'
import type { SpreadsheetError } from '../shared'
import { DEFAULT_FIND_REPLACE_FORM_STATE, INITIAL_CURSOR } from './constants'
import type { FindReplaceOperationAttempt, FindReplaceSessionState } from './internal-types'
import { INITIAL_SESSION } from './internal-types'
import { copyCursor } from './value-domain'

export const findReplaceQueryStateAtom = atom<FindReplaceQuery | null>(null)
export const findReplaceCursorStateAtom = atom<FindCursorState>(copyCursor(INITIAL_CURSOR))
export const findReplaceFormStateAtom = atom<FindReplaceFormState>({ ...DEFAULT_FIND_REPLACE_FORM_STATE })
export const findReplaceSessionStateAtom = atom<FindReplaceSessionState>({ ...INITIAL_SESSION })
export const findReplaceRequestSequenceAtom = atom(0)
export const findReplaceOperationAttemptLedgerStateAtom = atom<readonly FindReplaceOperationAttempt[]>([])
export const findReplaceCommandErrorStateAtom = atom<SpreadsheetError | null>(null)
export const replaceAllCappedStateAtom = atom<ReplaceAllCapInfo | null>(null)
export const findReplaceCapabilityStateAtom = atom<FindReplaceCapability>('unknown')

findReplaceSessionStateAtom.debugLabel = 'spreadsheet.findReplace.internal.sessionState'
findReplaceRequestSequenceAtom.debugLabel = 'spreadsheet.findReplace.internal.requestSequence'
findReplaceOperationAttemptLedgerStateAtom.debugLabel =
  'spreadsheet.findReplace.internal.operationAttemptLedger'
findReplaceCapabilityStateAtom.debugLabel = 'spreadsheet.findReplace.internal.capabilityState'
