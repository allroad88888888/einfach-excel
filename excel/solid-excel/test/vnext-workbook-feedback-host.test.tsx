/** @jsxImportSource solid-js */

import { createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import {
  diagnosticsAtom,
  resolveContentMutationAtom,
  setSheetProtectionAtom,
} from '@einfach/spreadsheet-ui-core'

import {
  beginSpreadsheetWorkbookLifecycleAtom,
  rejectSpreadsheetWorkbookLifecycleAtom,
} from '../src/provider/atoms'
import { SpreadsheetWorkbookFeedbackHost } from '../src/feedback'

afterEach(cleanup)

function mount(store: Store) {
  return render(() => (
    <Provider store={store}>
      <SpreadsheetWorkbookFeedbackHost data-testid="feedback-host" />
    </Provider>
  ))
}

describe('SpreadsheetWorkbookFeedbackHost', () => {
  it('projects a blocked Atom command and dismisses it through diagnosticsAtom', () => {
    const store = createStore()
    const rendered = mount(store)
    store.setter(setSheetProtectionAtom, {
      sheetId: 'sheet-1',
      state: { mode: 'protected', unlockedRanges: [] },
    })

    const result = store.setter(resolveContentMutationAtom, {
      kind: 'clear-range',
      sheetId: 'sheet-1',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })

    expect(result.status).toBe('blocked')
    expect(rendered.getByTestId('diagnostics-item').getAttribute('data-code')).toBe(
      'MUTATION_BLOCKED_LOCKED',
    )

    fireEvent.click(rendered.getByTestId('diagnostics-dismiss'))

    expect(store.getter(diagnosticsAtom).items).toHaveLength(0)
    expect(rendered.queryByTestId('diagnostics')).toBeNull()
  })

  it('projects a lifecycle failure without inventing a backend retry command', () => {
    const store = createStore()
    const rendered = mount(store)

    store.setter(beginSpreadsheetWorkbookLifecycleAtom, 7)
    store.setter(rejectSpreadsheetWorkbookLifecycleAtom, {
      error: 'worker unavailable',
      sessionId: 7,
    })

    const feedback = rendered.getByTestId('feedback-host-recovery-feedback')
    expect(feedback.getAttribute('role')).toBe('alert')
    expect(feedback.textContent).toContain('worker unavailable')
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })
})
