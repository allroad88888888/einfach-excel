import { createStore, type Store } from '@einfach/core'
import {
  clipboardStateAtom,
  copyClipboardAtom,
  type ClipboardTransferInput,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { act, fireEvent, render } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetClipboard } from '../src/use-spreadsheet-clipboard'

const backend = {} as SpreadsheetBackend

function transfer(sheetId: string): ClipboardTransferInput {
  return {
    source: {
      sheetId,
      range: { rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 4 },
    },
    target: {
      sheetId,
      range: { rowStart: 5, rowEnd: 6, colStart: 7, colEnd: 8 },
    },
    includesFormulas: true,
  }
}

function ClipboardSurface({ id }: { id: string }) {
  const clipboard = useSpreadsheetClipboard()
  const input = transfer(id)

  return (
    <section data-testid={id}>
      <output data-testid={`${id}-status`}>{clipboard.state.status}</output>
      <output data-testid={`${id}-intent`}>{clipboard.state.intent?.type ?? ''}</output>
      <button data-testid={`${id}-copy`} onClick={() => clipboard.copy(input)}>
        Copy
      </button>
      <button data-testid={`${id}-cut`} onClick={() => clipboard.cut(input)}>
        Cut
      </button>
      <button data-testid={`${id}-paste`} onClick={() => clipboard.paste(input)}>
        Paste
      </button>
      <button data-testid={`${id}-ready`} onClick={() => clipboard.ready()}>
        Ready
      </button>
      <button
        data-testid={`${id}-error`}
        onClick={() => clipboard.setError({ code: 'BACKEND_ERROR', message: 'clipboard failed' })}
      >
        Error
      </button>
      <button data-testid={`${id}-clear`} onClick={() => clipboard.clear()}>
        Clear
      </button>
    </section>
  )
}

function renderSurface(store: Store, id = 'sheet-1') {
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <ClipboardSurface id={id} />
    </SpreadsheetUiProvider>,
  )
}

describe('useSpreadsheetClipboard', () => {
  it('subscribes to UI-core state and forwards clipboard commands', () => {
    const store = createStore()
    const view = renderSurface(store)

    act(() => store.setter(copyClipboardAtom, transfer('external')))
    expect(view.getByTestId('sheet-1-status')).toHaveTextContent('copying')
    expect(view.getByTestId('sheet-1-intent')).toHaveTextContent('clipboard.copy')

    fireEvent.click(view.getByTestId('sheet-1-cut'))
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'cutting',
      intent: { type: 'clipboard.cut' },
      source: { sheetId: 'sheet-1' },
      target: { sheetId: 'sheet-1' },
      payload: { includesFormulas: true },
      error: null,
    })

    fireEvent.click(view.getByTestId('sheet-1-paste'))
    expect(store.getter(clipboardStateAtom).status).toBe('pasting')
    fireEvent.click(view.getByTestId('sheet-1-ready'))
    expect(store.getter(clipboardStateAtom).status).toBe('ready')

    fireEvent.click(view.getByTestId('sheet-1-error'))
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'clipboard failed' },
    })

    fireEvent.click(view.getByTestId('sheet-1-clear'))
    expect(store.getter(clipboardStateAtom)).toEqual({
      status: 'idle',
      intent: null,
      source: null,
      target: null,
      payload: null,
      error: null,
    })
    expect(view.getByTestId('sheet-1-status')).toHaveTextContent('idle')
  })

  it('keeps clipboard state isolated between sibling providers', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <ClipboardSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <ClipboardSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    fireEvent.click(view.getByTestId('first-copy'))

    expect(firstStore.getter(clipboardStateAtom)).toMatchObject({
      status: 'copying',
      intent: { type: 'clipboard.copy' },
      source: { sheetId: 'first' },
    })
    expect(secondStore.getter(clipboardStateAtom)).toEqual({
      status: 'idle',
      intent: null,
      source: null,
      target: null,
      payload: null,
      error: null,
    })
    expect(view.getByTestId('first-status')).toHaveTextContent('copying')
    expect(view.getByTestId('second-status')).toHaveTextContent('idle')
  })
})
