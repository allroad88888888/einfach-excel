/** @jsxImportSource solid-js */

import { createStore } from '@einfach/core'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import type {
  BackendMutationResult,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { setFormulaReferenceCaretAtom, startEditingAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFormulaAutocomplete } from '../src/formula-autocomplete'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

function createBackend(): SpreadsheetBackend {
  return {
    readVisibleProjection: async (
      request: VisibleProjectionRequest,
    ): Promise<VisibleProjectionResult> => ({
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      window: request.window,
      cells: [],
      revision: 'test-revision',
    }),
    readRangeProjection: async () => {
      throw new Error('not used')
    },
    setCellInput: async (request: SetCellInputRequest): Promise<BackendMutationResult> => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 'test-revision',
    }),
  }
}

function setRect(element: HTMLInputElement, rect: { left: number; top: number; width: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: rect.top + 20,
      height: 20,
      left: rect.left,
      right: rect.left + rect.width,
      top: rect.top,
      width: rect.width,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  })
}

function renderAutocomplete(draft = '=SU', caret = draft.length) {
  const store = createStore()
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 0, col: 0 },
    draft,
    source: 'cell',
  })
  store.setter(setFormulaReferenceCaretAtom, caret)

  const result = render(() => (
    <SpreadsheetUiProvider backend={createBackend()} store={store}>
      <input class="cell-input" data-testid="cell-input" />
      <input class="spreadsheet-formula-bar-input" data-testid="formula-input" />
      <button type="button" data-testid="outside-focus">
        Outside
      </button>
      <SpreadsheetFormulaAutocomplete />
    </SpreadsheetUiProvider>
  ))

  const cellInput = result.getByTestId('cell-input') as HTMLInputElement
  const formulaInput = result.getByTestId('formula-input') as HTMLInputElement
  setRect(cellInput, { left: 12, top: 20, width: 100 })
  setRect(formulaInput, { left: 40, top: 80, width: 180 })
  return { ...result, cellInput, formulaInput }
}

describe('vNext SpreadsheetFormulaAutocomplete', () => {
  it('reanchors suggestions when editing focus moves between supported inputs', async () => {
    const { cellInput, formulaInput, getByTestId } = renderAutocomplete()

    cellInput.focus()
    await waitFor(() => expect(getByTestId('formula-autocomplete').style.top).toBe('44px'))

    formulaInput.focus()
    await waitFor(() => {
      const overlay = getByTestId('formula-autocomplete')
      expect(overlay.style.left).toBe('40px')
      expect(overlay.style.top).toBe('104px')
    })
    expect(getByTestId('formula-autocomplete-list').getAttribute('aria-label')).toBe(
      'Function suggestions',
    )
  })

  it('hides the overlay when focus leaves a formula editing input', async () => {
    const { cellInput, getByTestId, queryByTestId } = renderAutocomplete()

    cellInput.focus()
    await waitFor(() => expect(getByTestId('formula-autocomplete')).toBeTruthy())
    ;(getByTestId('outside-focus') as HTMLButtonElement).focus()
    await waitFor(() => expect(queryByTestId('formula-autocomplete')).toBeNull())
  })

  it('anchors a function signature even when no suggestions are available', async () => {
    const { cellInput, getByTestId, queryByTestId } = renderAutocomplete('=SUM(', 5)

    cellInput.focus()
    await waitFor(() => {
      expect(getByTestId('formula-autocomplete').style.top).toBe('44px')
      expect(getByTestId('formula-autocomplete-signature').textContent).toContain('SUM')
    })
    expect(queryByTestId('formula-autocomplete-list')).toBeNull()
  })
})
