export const DEFAULT_HISTORY_CAP = 100
export const DEFAULT_HISTORY_TIMEOUT_MS = 15_000

export const HISTORY_CAPABILITY_ERROR =
  'History action is unavailable because this workbook does not provide the required transport.'
export const HISTORY_LOCAL_REPLAY_ERROR =
  'History local replay failed: no applier accepted the entry payload.'
export const HISTORY_REVISION_ERROR =
  'History action is unavailable because the current projection revision is invalid.'
export const HISTORY_PENDING_ERROR = 'Another history action already owns the transport lane.'
export const HISTORY_ACKNOWLEDGEMENT_ERROR =
  'History acknowledgement did not match the active request.'
export const HISTORY_OUTCOME_UNKNOWN_ERROR =
  'History result is unknown. Reload or reconcile workbook data before another history action.'
export const HISTORY_NOT_APPLIED_ERROR =
  'Backend confirmed the history transaction was not applied.'
