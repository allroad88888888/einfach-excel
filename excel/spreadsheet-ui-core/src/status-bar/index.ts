export * from './types'

export {
  computeSelectionAggregates,
  STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX,
} from './aggregates-compute'

export {
  statusBarProjectionCellsAtom,
  syncStatusBarProjectionAtom,
  STATUS_BAR_PROJECTION_CELLS_MAX,
  type StatusBarProjectionSyncInput,
} from './projection-state'

export {
  setStatusBarAggregateConfigAtom,
  statusBarAggregateConfigAtom,
  toggleStatusBarAggregateAtom,
} from './aggregate-config-state'

export { selectionAggregatesAtom, statusBarAggregateTruncatedAtom } from './selection-aggregates'
