import { atom } from '@einfach/core'
import { loadNamedRangeCapabilitiesAtom as loadCapabilities } from './capabilities'
import { refreshNamedRangeRegistryAtom as refreshRegistry } from './registry'
import { runNamedRangeMutationAtom as runMutation } from './mutation-runner'
import { settleNamedRangeMutationAtom as settleMutation } from './mutation-settlement'
import type {
  LoadNamedRangeCapabilitiesInput,
  RefreshNamedRangeRegistryInput,
  RunNamedRangeMutationInput,
  SettleNamedRangeMutationInput,
} from './types'

export * from './types'
export { NAMED_RANGE_CACHE_MAX, NAMED_RANGE_MUTATION_LEDGER_MAX } from './constants'
export {
  namedRangeCapabilitiesAtom,
  namedRangeMutationBlockedAtom,
  namedRangeMutationPendingAtom,
  namedRangeMutationStateAtom,
  namedRangeOperationAttemptLedgerAtom,
  namedRangeRegistryStateAtom,
} from './state'
export { nameRegistryCacheAtom, setNameRegistryAtom } from './registry'
export {
  nameManagerDraftGenerationAtom,
  nameManagerEditorAtom,
  nameManagerKindDraftAtom,
  nameManagerNameDraftAtom,
  nameManagerParamsDraftAtom,
  nameManagerRefersToDraftAtom,
  nameManagerScopeDraftAtom,
  nameManagerSelectedEntryAtom,
  nameManagerSessionIdAtom,
  type NameManagerKind,
} from './name-manager-draft'
export {
  beginNameManagerTableRenameAtom,
  cancelNameManagerTableRenameAtom,
  nameManagerTableEditorAtom,
  resetNameManagerTableEditorAtom,
  setNameManagerTablePendingDeleteAtom,
  settleNameManagerTableRenameAtom,
  updateNameManagerTableRenameDraftAtom,
  type NameManagerTableEditorState,
} from './name-manager-table-editor'
export {
  closeNameManagerAtom,
  deleteNameManagerEntryAtom,
  openNameManagerAtom,
  saveNameManagerAtom,
} from './name-manager-commands'

export const loadNamedRangeCapabilitiesAtom = atom(
  null,
  (_get, set, input: LoadNamedRangeCapabilitiesInput): void => set(loadCapabilities, input),
)
loadNamedRangeCapabilitiesAtom.debugLabel = 'spreadsheet.namedRanges.loadCapabilities'

export const refreshNamedRangeRegistryAtom = atom(
  null,
  (_get, set, input: RefreshNamedRangeRegistryInput): void => set(refreshRegistry, input),
)
refreshNamedRangeRegistryAtom.debugLabel = 'spreadsheet.namedRanges.refreshRegistry'

export const runNamedRangeMutationAtom = atom(
  null,
  (_get, set, input: RunNamedRangeMutationInput): void => set(runMutation, input),
)
runNamedRangeMutationAtom.debugLabel = 'spreadsheet.namedRanges.runMutation'

export const settleNamedRangeMutationAtom = atom(
  null,
  (_get, set, input: SettleNamedRangeMutationInput): void => set(settleMutation, input),
)
settleNamedRangeMutationAtom.debugLabel = 'spreadsheet.namedRanges.settleMutation'
