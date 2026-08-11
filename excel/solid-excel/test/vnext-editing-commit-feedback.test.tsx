/** @jsxImportSource solid-js */

import { createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import type { EditingCommitLifecycleState } from '@einfach/spreadsheet-ui-core'
import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  runEditingCommitAtom,
  startEditingAtom,
} from '@einfach/spreadsheet-ui-core'

import { SpreadsheetWorkbookFeedbackHost } from '../src-vnext/feedback'
import { editingCommitFeedback } from '../src-vnext/feedback/editing-commit-feedback'

afterEach(cleanup)

function mount(store: Store) {
  return render(() => (
    <Provider store={store}>
      <SpreadsheetWorkbookFeedbackHost data-testid="feedback-host" />
    </Provider>
  ))
}

function lifecycle(status: EditingCommitLifecycleState['status'], error = ''): EditingCommitLifecycleState {
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

/** Drives a real commit whose transport never answers — the demo's exact shape. */
async function commitAgainstAStalledBackend(store: Store) {
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 0, col: 0 },
    draft: '999',
    source: 'cell',
  })
  return store.setter(runEditingCommitAtom, {
    source: { setCellInput: () => new Promise<never>(() => {}) },
    refreshProjection: async () => {},
    // The production default is 15s; the deadline itself is not what this
    // test is about, only what the UI does once it fires.
    timeoutMs: 10,
  })
}

describe('editing commit feedback', () => {
  describe('lifecycle → copy mapping', () => {
    it('speaks for every terminal state that leaves the draft open', () => {
      expect(editingCommitFeedback(lifecycle('rejected', 'boom'))).toEqual({
        kind: 'error',
        message: 'That edit was not saved.',
        detail: 'boom',
      })
      expect(editingCommitFeedback(lifecycle('outcome-unknown'))?.message).toBe(
        'This edit was not confirmed — it may or may not have been saved.',
      )
      expect(editingCommitFeedback(lifecycle('refresh-failed'))?.message).toBe(
        'This edit was saved, but the sheet could not be refreshed.',
      )
    })

    it('stays quiet while a commit is merely in flight', () => {
      // A spinner on every keystroke would be worse than the bug being fixed.
      expect(editingCommitFeedback(lifecycle('ready'))).toBeNull()
      expect(editingCommitFeedback(lifecycle('pending'))).toBeNull()
      expect(editingCommitFeedback(lifecycle('local-acknowledged'))).toBeNull()
      expect(editingCommitFeedback(lifecycle('refreshing'))).toBeNull()
      expect(editingCommitFeedback(lifecycle('blocked'))).toBeNull()
    })

    it('never flags an error without words to show', () => {
      for (const status of ['rejected', 'outcome-unknown', 'refresh-failed'] as const) {
        expect(editingCommitFeedback(lifecycle(status))?.message).toBeTruthy()
      }
    })
  })

  it('tells the user when a commit times out instead of failing silently', async () => {
    const store = createStore()
    const rendered = mount(store)

    const outcome = await commitAgainstAStalledBackend(store)

    expect(outcome).toBe('outcome-unknown')
    expect(store.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')

    // The regression this guards: the draft is deliberately kept open, so
    // without a surface the user sees a live editor and no explanation.
    expect(store.getter(editingSessionAtom).status).not.toBe('idle')

    await waitFor(() => {
      const surface = rendered.getByTestId('feedback-host-editing-commit-feedback')
      expect(surface.getAttribute('role')).toBe('alert')
      expect(surface.textContent).toContain('not confirmed')
    })
  })

  it('offers no retry button when the host supplies no retry command', async () => {
    const store = createStore()
    const rendered = mount(store)

    await commitAgainstAStalledBackend(store)

    await waitFor(() => {
      expect(rendered.getByTestId('feedback-host-editing-commit-feedback')).not.toBeNull()
    })
    // Same contract as SpreadsheetWorkbookRecovery: this component cannot
    // re-run a commit it does not own the backend port for.
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })

  it('shows nothing at all while no commit has failed', () => {
    const store = createStore()
    const rendered = mount(store)

    const host = rendered.getByTestId('feedback-host-editing-commit')
    expect(host.getAttribute('data-commit-status')).toBe('ready')
    expect(rendered.queryByTestId('feedback-host-editing-commit-feedback')).toBeNull()
  })
})
