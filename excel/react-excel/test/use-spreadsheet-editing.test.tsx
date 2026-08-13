import { createStore, type Store } from '@einfach/core'
import {
  editingSessionAtom,
  type EditingCommitIntent,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetEditing } from '../src/use-spreadsheet-editing'

const backend = {} as SpreadsheetBackend

interface EditingSurfaceProps {
  readonly id: string
  readonly onCommit?: (intent: EditingCommitIntent | null) => void
}

function EditingSurface({ id, onCommit }: EditingSurfaceProps) {
  const editing = useSpreadsheetEditing()

  return (
    <div data-testid={id}>
      <output data-testid={`${id}-status`}>{editing.session.status}</output>
      <output data-testid={`${id}-draft`}>{editing.draft}</output>
      <button
        data-testid={`${id}-start`}
        onClick={() =>
          editing.start({
            sheetId: id,
            cell: { row: 2, col: 3 },
            draft: 'before',
            source: 'cell',
          })
        }
      >
        Start
      </button>
      <button
        data-testid={`${id}-draft-button`}
        onClick={() => editing.setDraft({ draft: 'after' })}
      >
        Draft
      </button>
      <button
        data-testid={`${id}-commit`}
        onClick={() => onCommit?.(editing.commit({ input: editing.draft, move: 'down' }))}
      >
        Commit
      </button>
      <button data-testid={`${id}-cancel`} onClick={() => editing.cancel()}>
        Cancel
      </button>
    </div>
  )
}

function renderSurface(store: Store, id = 'sheet-1', onCommit?: EditingSurfaceProps['onCommit']) {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <EditingSurface id={id} onCommit={onCommit} />
    </SpreadsheetUiProvider>,
  )
}

describe('useSpreadsheetEditing', () => {
  it('keeps editing sessions isolated in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <EditingSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <EditingSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    fireEvent.click(view.getByTestId('first-start'))

    expect(firstStore.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'first', cell: { row: 2, col: 3 } },
      draft: 'before',
    })
    expect(secondStore.getter(editingSessionAtom)).toMatchObject({ status: 'idle', draft: '' })
  })

  it('subscribes to the core session and draft while forwarding edit commands', () => {
    const store = createStore()
    const onCommit = jest.fn()
    const view = renderSurface(store, 'sheet-1', onCommit)

    fireEvent.click(view.getByTestId('sheet-1-start'))
    expect(view.getByTestId('sheet-1-status')).toHaveTextContent('drafting')
    expect(view.getByTestId('sheet-1-draft')).toHaveTextContent('before')

    fireEvent.click(view.getByTestId('sheet-1-draft-button'))
    expect(store.getter(editingSessionAtom)).toMatchObject({ draft: 'after', status: 'drafting' })
    expect(view.getByTestId('sheet-1-draft')).toHaveTextContent('after')

    fireEvent.click(view.getByTestId('sheet-1-commit'))
    const intent = store.getter(editingSessionAtom)
    expect(intent).toMatchObject({ draft: 'after', status: 'drafting' })
    expect(onCommit).toHaveBeenLastCalledWith({
      type: 'editing.commit',
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
      source: 'cell',
      input: 'after',
      move: 'down',
    })

    fireEvent.click(view.getByTestId('sheet-1-cancel'))
    expect(store.getter(editingSessionAtom)).toMatchObject({ status: 'cancelled', draft: '' })
    expect(view.getByTestId('sheet-1-status')).toHaveTextContent('cancelled')
  })

  it('returns the core commit result instead of inventing a React editing intent', () => {
    const store = createStore()
    let commit: (() => EditingCommitIntent | null) | undefined

    function CommitBridge() {
      const editing = useSpreadsheetEditing()
      commit = () => editing.commit({ input: editing.draft })
      return null
    }

    render(
      <SpreadsheetUiProvider backend={backend} store={store}>
        <CommitBridge />
      </SpreadsheetUiProvider>,
    )

    act(() => {
      expect(commit?.()).toBeNull()
    })
  })
})
