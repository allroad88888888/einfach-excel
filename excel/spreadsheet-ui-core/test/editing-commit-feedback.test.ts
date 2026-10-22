import { createStore } from '@einfach/core'
import { describe, expect, it, vi } from 'vitest'
import { editingCommitFeedback, isUnresolvedEditingCommit } from '../src/editing/commit-feedback'
import type { EditingCommitLifecycleState } from '../src/editing'
import { commitCellEditingAtom, editingCommitLifecycleAtom, editingDraftAtom,
  editingSessionAtom, cancelEditingAtom } from '../src/editing'
import { configureHostControlsAtom, resolveSpreadsheetRuntimeAtom, workbookChangeAtom,
  projectionSnapshotAtom } from '../src'
import { createRustWorkbookConnection } from '../src/rust-workbook/commands'
import type { WorkerLike } from '../src/rust-worker/types'
import { startCellEdit } from './editing-test-support'

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
  it.each(['HOST_READ_ONLY', 'HOST_BUSY', 'HOST_STRUCTURE_DISABLED'])(
    'preserves the stable %s diagnostic for the presentation dictionary', (code) => {
      for (const error of [code, `Editing commit was rejected and may be retried: ${code}`]) {
        expect(editingCommitFeedback(lifecycle('rejected', error))).toEqual({
          kind: 'error', message: code, detail: error,
        })
      }
    },
  )
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

  it('does not turn unknown host errors or an uncertain outcome into a known rejection', () => {
    expect(editingCommitFeedback(lifecycle('rejected', 'HOST_FUTURE_ERROR'))).toEqual({
      kind: 'error', message: 'That edit was not saved.', detail: 'HOST_FUTURE_ERROR',
    })
    expect(editingCommitFeedback(lifecycle('outcome-unknown', 'HOST_READ_ONLY'))).toEqual({
      kind: 'error',
      message: 'This edit was not confirmed — it may or may not have been saved.',
      detail: 'HOST_READ_ONLY',
    })
  })

  it('stays quiet while a commit is non-terminal', () => {
    expect(editingCommitFeedback(lifecycle('ready'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('pending'))).toBeNull()
    expect(editingCommitFeedback(lifecycle('blocked'))).toBeNull()
  })
})

describe('host-controlled editing feedback through the command lane', () => {
  it.each([
    ['cell', 'readOnly', 'HOST_READ_ONLY'], ['formula-bar', 'readOnly', 'HOST_READ_ONLY'],
    ['cell', 'busy', 'HOST_BUSY'], ['formula-bar', 'busy', 'HOST_BUSY'],
  ] as const)('keeps the %s draft and reports %s explicitly', async (source, control, code) => {
    const store = createStore()
    const sent: string[] = []
    let receive: (event: MessageEvent) => void = () => {}
    const worker: WorkerLike = {
      postMessage(message) {
        const input = message as { id: number; command: string }
        sent.push(input.command)
        if (input.command !== 'host.configure') throw new Error('A locked edit reached the Worker')
        receive({ data: { id: input.id, ok: true, result: undefined } } as MessageEvent)
      },
      addEventListener(type, listener) { if (type === 'message') receive = listener },
      removeEventListener() {}, terminate: vi.fn(),
    }
    const connection = createRustWorkbookConnection(() => worker)
    try {
      store.setter(resolveSpreadsheetRuntimeAtom, { connection })
      await expect(store.setter(configureHostControlsAtom, { [control]: true }))
        .resolves.toEqual({ status: 'ok' })
      startCellEdit(store, '=1+2')
      store.setter(editingDraftAtom, { draft: '=1+2', source })
      const projection = store.getter(projectionSnapshotAtom)
      const event = store.getter(workbookChangeAtom)
      expect(await store.setter(commitCellEditingAtom)).toBe('rejected')
      const state = store.getter(editingCommitLifecycleAtom)
      expect(state).toMatchObject({ status: 'rejected', error: expect.stringContaining(code) })
      expect(editingCommitFeedback(state)).toEqual({ kind: 'error', message: code,
        detail: state.error })
      expect(store.getter(editingSessionAtom)).toMatchObject({ status: 'drafting',
        draft: '=1+2', source: { source } })
      expect(store.getter(projectionSnapshotAtom)).toBe(projection)
      expect(store.getter(workbookChangeAtom)).toBe(event)
      expect(sent).toEqual(['host.configure'])
      expect(store.setter(cancelEditingAtom)).toBe(true)
    } finally { connection.dispose() }
  })
})
