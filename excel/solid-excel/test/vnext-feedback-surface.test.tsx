/** @jsxImportSource solid-js */

import { atom, createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'

import {
  SpreadsheetFeedbackSurface,
  useAtomFeedbackPresentation,
  type SpreadsheetFeedback,
} from '../src-vnext/feedback'

type CommandState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly message: string }
  | {
      readonly status: 'error'
      readonly message: string
      readonly detail?: string
      readonly retryLabel?: string
    }

const commandStateAtom = atom<CommandState>({ status: 'idle' })

function toFeedback(state: CommandState): SpreadsheetFeedback | null {
  switch (state.status) {
    case 'loading':
      return { kind: 'loading', message: state.message }
    case 'error':
      return {
        kind: 'error',
        message: state.message,
        detail: state.detail,
        retryLabel: state.retryLabel,
      }
    case 'idle':
      return null
  }
}

function FeedbackFixture(props: { readonly onRetry?: () => void }) {
  const feedback = useAtomFeedbackPresentation({
    sourceAtom: commandStateAtom,
    map: toFeedback,
  })

  return <SpreadsheetFeedbackSurface feedback={feedback} onRetry={props.onRetry} />
}

function mount(store: Store, onRetry?: () => void) {
  return render(() => (
    <Provider store={store}>
      <FeedbackFixture onRetry={onRetry} />
    </Provider>
  ))
}

afterEach(cleanup)

describe('SpreadsheetFeedbackSurface', () => {
  it('derives loading feedback from an atom accessor', () => {
    const store = createStore()
    const rendered = mount(store)

    expect(rendered.queryByTestId('feedback-surface')).toBeNull()

    store.setter(commandStateAtom, { status: 'loading', message: 'Refreshing rows' })

    const surface = rendered.getByTestId('feedback-surface')
    expect(surface.getAttribute('role')).toBe('status')
    expect(surface.getAttribute('aria-live')).toBe('polite')
    expect(surface.getAttribute('aria-busy')).toBe('true')
    expect(surface.getAttribute('data-state')).toBe('loading')
    expect(surface.textContent).toContain('Refreshing rows')
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })

  it('renders a retryable atom-derived error and leaves retry execution to its caller', () => {
    const store = createStore()
    const retry = jest.fn()
    const rendered = mount(store, retry)

    store.setter(commandStateAtom, {
      status: 'error',
      message: 'Could not refresh rows',
      detail: 'The connection was interrupted.',
      retryLabel: 'Try again',
    })

    const surface = rendered.getByTestId('feedback-surface')
    expect(surface.getAttribute('role')).toBe('alert')
    expect(surface.getAttribute('data-state')).toBe('error')
    expect(surface.getAttribute('data-retryable')).toBe('true')
    expect(surface.textContent).toContain('The connection was interrupted.')

    fireEvent.click(rendered.getByTestId('feedback-retry'))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('does not invent a retry action when the command has not supplied one', () => {
    const store = createStore()
    const rendered = mount(store)

    store.setter(commandStateAtom, {
      status: 'error',
      message: 'Could not refresh rows',
      retryLabel: 'Try again',
    })

    expect(rendered.getByTestId('feedback-surface').getAttribute('data-retryable')).toBe('false')
    expect(rendered.queryByTestId('feedback-retry')).toBeNull()
  })
})
