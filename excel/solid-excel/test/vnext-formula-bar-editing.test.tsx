/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  BackendMutationResult,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { editingSessionAtom, selectCellAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFormulaBar } from '../src/formula-bar'
import { SpreadsheetUiProvider } from '../src/provider'
import { seedReadyVisibleProjection } from './projection-test-fixture'

afterEach(cleanup)

const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

function createProjection(): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    sheetId: 'sheet-1',
    requestId: 1,
    window,
    cells: [{ row: 0, col: 0, displayValue: 'saved' }],
    revision: 'rev-1',
  }
}

function mount(setCellInput: (request: SetCellInputRequest) => Promise<BackendMutationResult>) {
  const store = createStore()
  const projection = createProjection()
  const backend: SpreadsheetBackend = {
    readVisibleProjection: jest.fn(async (_request: VisibleProjectionRequest) => projection),
    readRangeProjection: async () => {
      throw new Error('not used')
    },
    setCellInput,
  }
  seedReadyVisibleProjection(store, {
    status: 'ready',
    request: { kind: 'visible-window', sheetId: 'sheet-1', window, requestId: 1 },
    result: projection,
  })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

  const rendered = render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetFormulaBar />
    </SpreadsheetUiProvider>
  ))
  return {
    ...rendered,
    input: rendered.getByTestId('formula-bar-input') as HTMLInputElement,
    store,
  }
}

describe('vNext formula bar editing interactions', () => {
  it('leaves Enter to an active DOM IME composition until it ends', async () => {
    const setCellInput = jest.fn(async () => ({ sheetId: 'sheet-1' }))
    const { input, store } = mount(setCellInput)

    fireEvent.input(input, { target: { value: 'interim' } })
    fireEvent.compositionStart(input)
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    })
    input.dispatchEvent(event)

    await Promise.resolve()
    expect(event.defaultPrevented).toBe(false)
    expect(setCellInput).not.toHaveBeenCalled()
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      draft: 'interim',
    })

    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(setCellInput).toHaveBeenCalledTimes(1))
  })

  it('keeps a rejected draft focused and announces the shared lifecycle error', async () => {
    const setCellInput = jest.fn(async () => {
      throw new Error('Network unavailable')
    })
    const { getByRole, input, store } = mount(setCellInput)

    input.focus()
    fireEvent.input(input, { target: { value: 'interim' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(getByRole('alert').textContent).toEqual(
        expect.stringContaining('Network unavailable'),
      ),
    )
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-errormessage')).toBe('spreadsheet-formula-bar-editing-error')
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      draft: 'interim',
    })
  })
})
