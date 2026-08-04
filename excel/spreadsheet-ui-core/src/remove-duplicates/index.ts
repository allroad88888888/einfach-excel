/**
 * Public compatibility facade for Remove Duplicates.
 * Immutable dialog state, transport authority, and mutation reconciliation
 * live in focused sibling modules.
 */
export * from './types'
export { findDuplicateRows } from './algorithm'
export {
  DEFAULT_REMOVE_DUPLICATES_TIMEOUT_MS,
  REMOVE_DUPLICATES_HISTORY_BUSY_ERROR,
  REMOVE_DUPLICATES_OUTCOME_UNKNOWN_ERROR,
  REMOVE_DUPLICATES_READ_CAPABILITY_ERROR,
  REMOVE_DUPLICATES_READ_FAILED_ERROR,
  REMOVE_DUPLICATES_READ_STALE_ERROR,
  REMOVE_DUPLICATES_REFRESH_ERROR_PREFIX,
  REMOVE_DUPLICATES_REMOVE_CAPABILITY_ERROR,
} from './constants'
export {
  nextRemoveDuplicatesMutationRequestId,
  nextRemoveDuplicatesReadRequestId,
  nextRemoveDuplicatesSessionId,
} from './domain'
export {
  removeDuplicatesBusyAtom,
  removeDuplicatesCanCloseAtom,
  removeDuplicatesCanConfirmAtom,
  removeDuplicatesCanEditAtom,
  removeDuplicatesCanRetryReadAtom,
  removeDuplicatesCapabilityAtom,
  removeDuplicatesComparisonAtom,
  removeDuplicatesErrorAtom,
  removeDuplicatesExcludeHeaderAtom,
  removeDuplicatesKeyColumnsAtom,
  removeDuplicatesLifecycleAtom,
  removeDuplicatesMutationRequestIdAtom,
  removeDuplicatesMutationTargetAtom,
  removeDuplicatesOpenAtom,
  removeDuplicatesPreviewAtom,
  removeDuplicatesRangeAtom,
  removeDuplicatesReadRequestIdAtom,
  removeDuplicatesScanInputCellsAtom,
  removeDuplicatesSessionAtom,
  removeDuplicatesSessionIdAtom,
} from './state'
export {
  captureRemoveDuplicatesCapabilityAtom,
  closeRemoveDuplicatesAtom,
  deselectAllKeyColumnsAtom,
  dispatchRemoveDuplicatesIntentAtom,
  openRemoveDuplicatesAtom,
  selectAllKeyColumnsAtom,
  toggleKeyColumnAtom,
} from './dialog-commands'
export {
  openRemoveDuplicatesFromSelectionAtom,
  retryRemoveDuplicatesReadAtom,
} from './read-command'
export { runRemoveDuplicatesConfirmAtom } from './mutation-command'
