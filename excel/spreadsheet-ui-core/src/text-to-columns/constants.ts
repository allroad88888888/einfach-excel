/** Bounds the preview rows retained by the Text to Columns wizard. */
export const TEXT_TO_COLUMNS_PREVIEW_CAP = 100

/** Bounds the preview cells retained by the Text to Columns wizard. */
export const TEXT_TO_COLUMNS_PREVIEW_TOKEN_CAP = 500

/** Visible sentinel for a preview row truncated by the shared token budget. */
export const TEXT_TO_COLUMNS_PREVIEW_TRUNCATION_MARK = '…'

export const TEXT_TO_COLUMNS_CAPABILITY_ERROR =
  'Text to Columns is unavailable because this workbook does not provide importCellChunks.'
export const TEXT_TO_COLUMNS_CONTEXT_ERROR =
  'Text to Columns needs an active single-column source and a completed wizard.'
export const TEXT_TO_COLUMNS_ACKNOWLEDGEMENT_ERROR =
  'Text to Columns acknowledgement did not match the active request and target.'
export const TEXT_TO_COLUMNS_OUTCOME_UNKNOWN_ERROR =
  'Text to Columns may have been applied, but the backend did not return a matching acknowledgement. ' +
  'To avoid a duplicate import, refresh or reload the workbook before trying again.'
export const TEXT_TO_COLUMNS_TRANSPORT_ERROR_PREFIX = 'Text to Columns could not be applied: '
export const TEXT_TO_COLUMNS_REFRESH_ERROR_PREFIX =
  'Text to Columns was acknowledged, but projection refresh failed: '
export const TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR =
  'Text to Columns requires an active single-column selection.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_PORT_ERROR =
  'Text to Columns source is unavailable because this workbook does not provide range projection reads.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR =
  'Text to Columns source loading is already in progress.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR =
  'Close the current Text to Columns dialog before loading another source.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR =
  'Text to Columns source was ignored because the active sheet, selection, or dialog session changed.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_RESULT_ERROR =
  'Text to Columns could not open because the source projection did not match the active request and target.'
export const TEXT_TO_COLUMNS_ENTRYPOINT_TRANSPORT_ERROR_PREFIX =
  'Text to Columns source could not be loaded: '
