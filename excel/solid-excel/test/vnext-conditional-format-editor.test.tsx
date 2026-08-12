/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  openConditionalFormatEditorAtom,
  setConditionalFormatRulesAtom,
  setSelectionAtom,
  setWorkspaceActiveSheetAtom,
  type ConditionalFormatRuleEntry,
  type SetConditionalFormatRuleRequest,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetConditionalFormatDialog } from '../src-vnext/conditional-formatting'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

const ENTRY: ConditionalFormatRuleEntry = {
  id: 'rule-cell-value',
  priority: 1,
  scope: { range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 } },
  rule: { kind: 'cell-value', operator: 'gt', value: '10', format: { bold: true } },
}

function backend(
  setConditionalFormatRule: NonNullable<SpreadsheetBackend['setConditionalFormatRule']>,
): SpreadsheetBackend {
  return {
    async readVisibleProjection(request) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection(request) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        range: request.range,
        cells: [],
      }
    },
    async setCellInput() {
      throw new Error('not used')
    },
    setConditionalFormatRule,
  }
}

function renderEditor(store: ReturnType<typeof createStore>, appBackend: SpreadsheetBackend) {
  return render(() => (
    <SpreadsheetUiProvider backend={appBackend} store={store}>
      <SpreadsheetConditionalFormatDialog />
    </SpreadsheetUiProvider>
  ))
}

function prepare(store: ReturnType<typeof createStore>) {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(setConditionalFormatRulesAtom, { sheetId: 'sheet-1', rules: [ENTRY] })
  store.setter(setSelectionAtom, {
    kind: 'range',
    sheetId: 'sheet-1',
    anchor: { row: 4, col: 5 },
    focus: { row: 6, col: 7 },
  })
  store.setter(openConditionalFormatEditorAtom, ENTRY)
}

describe('conditional-format rule editor fields', () => {
  it('edits an existing rule, adopts the selection, and submits the atom draft', async () => {
    const store = createStore()
    prepare(store)
    const setRule = jest.fn(async (request: SetConditionalFormatRuleRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
    }))
    const view = renderEditor(store, backend(setRule))

    fireEvent.click(await waitFor(() => view.getByTestId('cf-use-selection-button')))
    fireEvent.change(view.getByTestId('cf-priority-input'), { target: { value: '4' } })
    fireEvent.change(view.getByTestId('cf-cell-value'), { target: { value: '42' } })
    fireEvent.submit(view.getByTestId('conditional-format-dialog'))

    await waitFor(() => expect(setRule).toHaveBeenCalledTimes(1))
    expect(setRule.mock.calls[0][0]).toMatchObject({
      sheetId: 'sheet-1',
      scope: { range: { rowStart: 4, rowEnd: 6, colStart: 5, colEnd: 7 } },
      priority: 4,
      rule: { kind: 'cell-value', value: '42' },
    })
  })

  it('renders the supported kind fields and exposes validation before save', async () => {
    const store = createStore()
    prepare(store)
    const setRule = jest.fn(async (request: SetConditionalFormatRuleRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
    }))
    const view = renderEditor(store, backend(setRule))
    const kindSelect = await waitFor(() => view.getByTestId('cf-rule-kind-select'))

    fireEvent.change(kindSelect, { target: { value: 'formula' } })
    expect(await waitFor(() => view.getByTestId('cf-formula-value'))).toBeTruthy()
    fireEvent.change(view.getByTestId('cf-formula-value'), { target: { value: ' ' } })
    const error = await waitFor(() => view.getByTestId('cf-error-text'))
    expect(error.textContent).toContain('formula')
    expect((view.getByTestId('cf-save-button') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(kindSelect, { target: { value: 'data-bar' } })
    expect(await waitFor(() => view.getByTestId('cf-data-bar-min-color'))).toBeTruthy()
    fireEvent.change(kindSelect, { target: { value: 'color-scale' } })
    expect(await waitFor(() => view.getByTestId('cf-color-scale-mid-color'))).toBeTruthy()
    fireEvent.change(kindSelect, { target: { value: 'top-bottom' } })
    expect(await waitFor(() => view.getByTestId('cf-top-bottom-count'))).toBeTruthy()
    expect(setRule).not.toHaveBeenCalled()
  })
})
