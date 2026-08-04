/** Public filter/sort core façade. Implementation modules remain source-private. */
export * from './types'
export * from './constants'
export {
  nextFilterSortOperationId,
  nextFilterSortRequestId,
  nextFilterSortSessionId,
} from './value-domain'
export * from './projection-atoms'
export * from './basic-commands'
export { runFilterSortMutationAtom } from './mutation-command'
export { reapplyFilterAtom, reapplyFilterDisabledReasonAtom } from './reapply-command'
export { retryFilterSortRefreshAtom } from './refresh-retry-command'
export { notifyActiveSheetChangedAtom } from './sheet-change-command'
export {
  PHYSICAL_SORT_REJECTION_MESSAGES,
  physicalSortRejectionMessage,
  sortRangeSupportedAtom,
  captureSortRangeCapabilityAtom,
  physicalSortDiagnosticAtom,
  clearPhysicalSortDiagnosticAtom,
  buildSortExcludedRows,
} from './physical-sort-domain'
export { runPhysicalSortAtom } from './physical-sort-command'
