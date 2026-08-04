import type { FindCursorState, FindReplaceFormState, FindReplaceRefreshRecoveryState } from './types'

export const MAX_FIND_PAGE = 500
export const MAX_OPERATION_LEDGER_ENTRIES = 32
export const DEFAULT_TRANSPORT_TIMEOUT_MS = 15_000
export const MAX_TRANSPORT_TIMEOUT_MS = 2_147_483_647

export const DEFAULT_FIND_REPLACE_FORM_STATE: Readonly<FindReplaceFormState> = Object.freeze({
  activeTab: 'find', needle: '', replacement: '', caseSensitive: false, wholeMatch: false,
  regex: false, searchFormulas: false, scope: 'sheet',
})

export const INITIAL_CURSOR: Readonly<FindCursorState> = Object.freeze({
  status: 'idle', currentIndex: 0, totalCount: 0, pageMatches: Object.freeze([]),
})

export const INITIAL_REFRESH_RECOVERY: Readonly<FindReplaceRefreshRecoveryState> = Object.freeze({
  status: 'idle', operationId: null, phase: null,
})
