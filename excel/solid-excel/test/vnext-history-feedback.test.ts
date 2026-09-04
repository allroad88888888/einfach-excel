import { describe, expect, it } from 'vitest'
import type { HistoryLifecycleState } from '@einfach/spreadsheet-ui-core'

import { historyLifecycleFeedback } from '../src/history/history-feedback'

function lifecycle(status: HistoryLifecycleState['status'], error = ''): HistoryLifecycleState {
  return {
    status,
    sessionId: 1,
    action: 'undo',
    transactionId: 'tx-1',
    requestId: 1,
    revision: 1,
    acknowledgedRevision: 2,
    error,
  }
}

describe('history lifecycle feedback', () => {
  it('keeps ready history silent and reports transport progress as loading', () => {
    expect(historyLifecycleFeedback(lifecycle('ready'))).toBeNull()
    expect(historyLifecycleFeedback(lifecycle('pending'))).toEqual({
      kind: 'loading',
      message: 'Applying history change…',
    })
    expect(historyLifecycleFeedback(lifecycle('refreshing'))).toEqual({
      kind: 'loading',
      message: 'Refreshing spreadsheet…',
    })
  })

  it('makes only a failed refresh retryable', () => {
    expect(historyLifecycleFeedback(lifecycle('refresh-failed', 'projection unavailable'))).toEqual(
      {
        kind: 'error',
        message: 'History change applied, but the spreadsheet could not refresh.',
        detail: 'projection unavailable',
        retryLabel: 'Retry refresh',
      },
    )
    expect(historyLifecycleFeedback(lifecycle('outcome-unknown', 'connection dropped'))).toEqual({
      kind: 'error',
      message: 'The history change may have completed. Check the spreadsheet before retrying.',
      detail: 'connection dropped',
    })
  })
})
