/**
 * Public compatibility facade for the Text to Columns feature.
 * State, wizard commands, transport authority, and tokenisation deliberately
 * live in focused sibling modules.
 */
export * from './types'
export {
  TEXT_TO_COLUMNS_ACKNOWLEDGEMENT_ERROR,
  TEXT_TO_COLUMNS_CAPABILITY_ERROR,
  TEXT_TO_COLUMNS_CONTEXT_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_PORT_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_RESULT_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_TRANSPORT_ERROR_PREFIX,
  TEXT_TO_COLUMNS_OUTCOME_UNKNOWN_ERROR,
  TEXT_TO_COLUMNS_PREVIEW_CAP,
  TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP,
  TEXT_TO_COLUMNS_PREVIEW_TRUNCATION_MARK,
  TEXT_TO_COLUMNS_REFRESH_ERROR_PREFIX,
  TEXT_TO_COLUMNS_TRANSPORT_ERROR_PREFIX,
} from './constants'
export {
  DEFAULT_DELIMITED_CONFIG,
  DEFAULT_FIXED_CONFIG,
  INITIAL_WIZARD_STATE,
  makeStepThreeState,
  makeStepTwoState,
} from './wizard-domain'
export { nextTextToColumnsRequestId, nextTextToColumnsSessionId } from './identity'
export { previewColumnCount, tokenize } from './tokenize'
export {
  textToColumnsAnchorAtom,
  textToColumnsCanCloseAtom,
  textToColumnsCanEditAtom,
  textToColumnsCanFinishAtom,
  textToColumnsCanGoBackAtom,
  textToColumnsCanGoNextAtom,
  textToColumnsCapabilityAtom,
  textToColumnsColumnCountAtom,
  textToColumnsEntrypointStateAtom,
  textToColumnsErrorAtom,
  textToColumnsHasSourceAtom,
  textToColumnsLifecycleAtom,
  textToColumnsNextBlockReasonAtom,
  textToColumnsOpenAtom,
  textToColumnsPreviewAtom,
  textToColumnsRequestIdAtom,
  textToColumnsSessionAtom,
  textToColumnsSessionIdAtom,
  textToColumnsSheetIdAtom,
  textToColumnsSourceAtom,
  textToColumnsWizardAtom,
} from './state'
export { textToColumnsEntrypointProjectionAtom } from './entrypoint-domain'
export {
  captureTextToColumnsCapabilityAtom,
  closeTextToColumnsAtom,
  dispatchTextToColumnsIntentAtom,
  openTextToColumnsAtom,
  type OpenTextToColumnsPayload,
} from './session-command'
export { confirmTextToColumnsAtom } from './commit-plan'
export { runTextToColumnsEntrypointAtom } from './entrypoint-command'
export { runTextToColumnsFinishAtom } from './finish-command'
