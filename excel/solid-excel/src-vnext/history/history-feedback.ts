import type { HistoryLifecycleState } from '@einfach/spreadsheet-ui-core'

import type { SpreadsheetFeedback } from '../feedback/types'

/** Maps history's Core lifecycle atom into the shared feedback contract. */
export function historyLifecycleFeedback(
  lifecycle: HistoryLifecycleState,
): SpreadsheetFeedback | null {
  switch (lifecycle.status) {
    case 'pending':
      return { kind: 'loading', message: 'Applying history change…' }
    case 'local-acknowledged':
    case 'refreshing':
      return { kind: 'loading', message: 'Refreshing spreadsheet…' }
    case 'refresh-failed':
      return {
        kind: 'error',
        message: 'History change applied, but the spreadsheet could not refresh.',
        detail: lifecycle.error || undefined,
        retryLabel: 'Retry refresh',
      }
    case 'outcome-unknown':
      return {
        kind: 'error',
        message: 'The history change may have completed. Check the spreadsheet before retrying.',
        detail: lifecycle.error || undefined,
      }
    case 'blocked':
      return {
        kind: 'error',
        message: 'This history change is currently unavailable.',
        detail: lifecycle.error || undefined,
      }
    case 'ready':
      return null
  }
}
