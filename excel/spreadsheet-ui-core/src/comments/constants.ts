import type { CommentMutationState } from './types'

export const COMMENT_MUTATION_LEDGER_MAX = 32
export const COMMENT_MUTATION_TIMEOUT_MS = 15_000
export const COMMENT_BODY_MAX = 32_768
export const COMMENT_ID_MAX = 1_024

export const INITIAL_COMMENT_MUTATION_STATE: CommentMutationState = Object.freeze({
  phase: 'Idle',
  action: null,
  requestId: null,
  error: null,
})
