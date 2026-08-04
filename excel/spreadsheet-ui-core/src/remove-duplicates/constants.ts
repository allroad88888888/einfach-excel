export const REMOVE_DUPLICATES_READ_CAPABILITY_ERROR = 'Remove Duplicates cannot read the selected range with this workbook backend.'
export const REMOVE_DUPLICATES_REMOVE_CAPABILITY_ERROR = 'Remove Duplicates is unavailable because this workbook does not provide removeRowsExact.'
export const REMOVE_DUPLICATES_READ_FAILED_ERROR = 'Remove Duplicates could not load a complete projection for the selected range.'
export const REMOVE_DUPLICATES_READ_STALE_ERROR = 'The selected range changed while Remove Duplicates was loading. Retry from the current selection.'
export const REMOVE_DUPLICATES_OUTCOME_UNKNOWN_ERROR = 'Rows may have been removed, but the backend did not return a matching acknowledgement. Refresh or reload the workbook before trying again.'
export const REMOVE_DUPLICATES_REFRESH_ERROR_PREFIX = 'Rows were removed, but the workbook projection could not be refreshed: '
export const REMOVE_DUPLICATES_HISTORY_BUSY_ERROR = 'Remove Duplicates is blocked while another mutation owns the history lane.'
export const DEFAULT_REMOVE_DUPLICATES_TIMEOUT_MS = 15_000
