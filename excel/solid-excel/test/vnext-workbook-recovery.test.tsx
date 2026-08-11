/** @jsxImportSource solid-js */

import { createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'

import {
  beginSpreadsheetWorkbookLifecycleAtom,
  rejectSpreadsheetWorkbookLifecycleAtom,
  resolveSpreadsheetWorkbookLifecycleAtom,
  type SpreadsheetWorkbookLifecycle,
} from '../src-vnext/provider/atoms'
import { SpreadsheetWorkbookRecovery, workbookLifecycleFeedback } from '../src-vnext/recovery'

afterEach(cleanup)

function lifecycle(
  phase: SpreadsheetWorkbookLifecycle['phase'],
  error: string | null = null,
): SpreadsheetWorkbookLifecycle {
  return { error, phase, sessionId: 7 }
}

function mount(store: Store, onRetry?: (current: SpreadsheetWorkbookLifecycle) => void) {
  return render(() => (
    <Provider store={store}>
      <SpreadsheetWorkbookRecovery onRetry={onRetry} />
    </Provider>
  ))
}

describe('workbookLifecycleFeedback', () => {
  it('only creates feedback for visible initialization and failure states', () => {
    expect(workbookLifecycleFeedback(lifecycle('idle'))).toBeNull()
    expect(workbookLifecycleFeedback(lifecycle('ready'))).toBeNull()
    expect(workbookLifecycleFeedback(lifecycle('initializing'))).toEqual({
      kind: 'loading',
      message: 'Loading workbook…',
    })
    expect(workbookLifecycleFeedback(lifecycle('failed', 'worker unavailable'))).toEqual({
      detail: 'worker unavailable',
      kind: 'error',
      message: 'Workbook could not be loaded.',
    })
  })
})

describe('SpreadsheetWorkbookRecovery', () => {
  it('keeps idle and ready lifecycle states quiet while retaining their Atom facts', () => {
    const store = createStore()
    const rendered = mount(store)

    expect(rendered.getByTestId('workbook-recovery').getAttribute('data-lifecycle-phase')).toBe(
      'idle',
    )
    expect(rendered.queryByTestId('workbook-recovery-feedback')).toBeNull()

    store.setter(beginSpreadsheetWorkbookLifecycleAtom, 7)
    store.setter(resolveSpreadsheetWorkbookLifecycleAtom, 7)

    expect(rendered.getByTestId('workbook-recovery').getAttribute('data-lifecycle-phase')).toBe(
      'ready',
    )
    expect(rendered.queryByTestId('workbook-recovery-feedback')).toBeNull()
  })

  it('announces Atom-owned initialization without presenting an invented retry', () => {
    const store = createStore()
    const rendered = mount(store)

    store.setter(beginSpreadsheetWorkbookLifecycleAtom, 7)

    const surface = rendered.getByTestId('workbook-recovery-feedback')
    expect(surface.getAttribute('role')).toBe('status')
    expect(surface.getAttribute('aria-busy')).toBe('true')
    expect(surface.textContent).toContain('Loading workbook…')
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })

  it('renders the failed lifecycle error without offering recovery it does not own', () => {
    const store = createStore()
    const rendered = mount(store)

    store.setter(beginSpreadsheetWorkbookLifecycleAtom, 7)
    store.setter(rejectSpreadsheetWorkbookLifecycleAtom, {
      error: new Error('worker unavailable'),
      sessionId: 7,
    })

    const surface = rendered.getByTestId('workbook-recovery-feedback')
    expect(surface.getAttribute('role')).toBe('alert')
    expect(surface.textContent).toContain('worker unavailable')
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })

  it('only invokes the host-supplied recovery action for the current failed session', () => {
    const store = createStore()
    const retry = jest.fn()
    const rendered = mount(store, retry)

    store.setter(beginSpreadsheetWorkbookLifecycleAtom, 7)
    store.setter(rejectSpreadsheetWorkbookLifecycleAtom, {
      error: 'worker unavailable',
      sessionId: 7,
    })

    fireEvent.click(rendered.getByTestId('feedback-retry'))

    expect(retry).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledWith({
      error: 'worker unavailable',
      phase: 'failed',
      sessionId: 7,
    })
  })
})
