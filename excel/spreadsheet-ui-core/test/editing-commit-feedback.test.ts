import { describe, expect, it } from 'vitest'
import { editingCommitFeedback, isUnresolvedEditingCommit } from '../src/editing/commit-feedback'
import type { EditingCommitLifecycleState } from '../src/editing'

function lifecycle(
  status: EditingCommitLifecycleState['status'],
  error = '',
): EditingCommitLifecycleState {
  return {
    status,
    error,
  }
}

describe('editing commit feedback', () => {
  it.each([
    ['the new column name collides with another column of the table', 'different column name'],
    ['column name must not be empty', 'non-empty column name'],
    ['Spilled arrays cannot be entered inside a table.', 'single-value formula or press Escape'],
  ])('explains a native Table input rejection: %s', (error, message) => {
    expect(editingCommitFeedback(lifecycle('rejected',
      `Editing commit was rejected and may be retried: ${error}`))?.message).toContain(message)
  })
  it('explains a native validation rejection without exposing transport details', () => {
    const feedback = editingCommitFeedback(lifecycle('rejected',
      'Editing commit was rejected and may be retried: DATA_VALIDATION_FAILED'))
    expect(feedback?.message).toContain('data validation rule')
    expect(feedback?.message).toContain('Escape')
    expect(feedback?.message).not.toContain('DATA_VALIDATION_FAILED')
  })

  it('maps each unresolved terminal lifecycle state to error feedback', () => {
    expect(editingCommitFeedback(lifecycle('rejected', 'boom'))).toEqual({
      kind: 'error',
      message: 'That edit was not saved.',
      detail: 'boom',
    })
    expect(editingCommitFeedback(lifecycle('outcome-unknown'))?.message).toContain('not confirmed')
    expect(isUnresolvedEditingCommit(lifecycle('rejected'))).toBe(true)
  })

  it('stays quiet while a commit is non-terminal', () => {
    expect(editingCommitFeedback(lifecycle('ready'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('pending'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('blocked'))).toBeNull()
  })
})
