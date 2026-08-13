import { describe, expect, it } from '@jest/globals'
import { editingCommitFeedback, isUnresolvedEditingCommit } from '../src/editing/commit-feedback'
import type { EditingCommitLifecycleState } from '../src/editing'

function lifecycle(
  status: EditingCommitLifecycleState['status'],
  error = '',
): EditingCommitLifecycleState {
  return {
    status,
    sessionId: 1,
    requestId: 1,
    sheetId: 'sheet-1',
    cell: { row: 0, col: 0 },
    acknowledgedRevision: null,
    error,
  }
}

describe('editing commit feedback', () => {
  it('maps each unresolved terminal lifecycle state to error feedback', () => {
    expect(editingCommitFeedback(lifecycle('rejected', 'boom'))).toEqual({
      kind: 'error',
      message: 'That edit was not saved.',
      detail: 'boom',
    })
    expect(editingCommitFeedback(lifecycle('outcome-unknown'))?.message).toContain('not confirmed')
    expect(editingCommitFeedback(lifecycle('refresh-failed'))?.message).toContain(
      'could not be refreshed',
    )
    expect(isUnresolvedEditingCommit(lifecycle('rejected'))).toBe(true)
  })

  it('stays quiet while a commit is non-terminal', () => {
    expect(editingCommitFeedback(lifecycle('ready'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('pending'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('local-acknowledged'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('refreshing'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('blocked'))).toBeNull()
  })
})
