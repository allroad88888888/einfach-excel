/**
 * Conditional-formatting public façade. Domain modules retain core-owned
 * snapshots and command mechanics; only product-facing atoms escape here.
 */
export * from './types'

export {
  CONDITIONAL_FORMAT_MUTATION_LEDGER_MAX,
  CONDITIONAL_FORMAT_RULES_MAX,
} from './constants'

export {
  closeConditionalFormatEditorAtom,
  conditionalFormatEditorAtom,
  conditionalFormatMutationBlockedAtom,
  conditionalFormatOperationAttemptLedgerAtom,
  conditionalFormatRulesCacheAtom,
  openConditionalFormatEditorAtom,
  setConditionalFormatEditorKindAtom,
  setConditionalFormatRulesAtom,
} from './state'

export { runConditionalFormatMutationAtom } from './mutation-executor'

export {
  nextConditionalFormatRequestId,
  nextConditionalFormatSessionId,
} from './value-domain'
