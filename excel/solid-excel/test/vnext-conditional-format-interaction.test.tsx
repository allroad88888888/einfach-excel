/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  SetConditionalFormatRuleRequest,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  conditionalFormatEditorAtom,
  openConditionalFormatEditorAtom,
  setConditionalFormatRulesAtom,
  type ConditionalFormatRuleEntry,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetConditionalFormatDialog } from '../src-vnext/conditional-formatting'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

const CELL_VALUE_ENTRY: ConditionalFormatRuleEntry = {
  id: 'rule-cell-value',
  priority: 1,
  scope: { range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 } },
  rule: { kind: 'cell-value', operator: 'gt', value: '10', format: { bold: true } },
}

const FORMULA_ENTRY: ConditionalFormatRuleEntry = {
  id: 'rule-formula',
  priority: 2,
  scope: { range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 } },
  rule: { kind: 'formula', formula: '=A1>10', format: { bgColor: '#f00' } },
}

function createBackend(
  setConditionalFormatRule: NonNullable<SpreadsheetBackend['setConditionalFormatRule']> = async (
    request,
  ) => ({
    sheetId: request.sheetId,
    requestId: request.requestId,
  }),
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

function renderDialog(store: ReturnType<typeof createStore>, backend: SpreadsheetBackend) {
  return render(() => (
    <>
      <button type="button" data-testid="conditional-format-opener">
        Open conditional formatting
      </button>
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetConditionalFormatDialog />
      </SpreadsheetUiProvider>
    </>
  ))
}

describe('SpreadsheetConditionalFormatDialog interactions', () => {
  it('uses the shared modal focus contract and restores the invoking focus', async () => {
    const store = createStore()
    const view = renderDialog(store, createBackend())
    const opener = view.getByTestId('conditional-format-opener') as HTMLButtonElement
    opener.focus()

    store.setter(openConditionalFormatEditorAtom, CELL_VALUE_ENTRY)

    const dialog = await waitFor(() => view.getByTestId('conditional-format-dialog'))
    const close = view.getByTestId('dialog-close-x')
    const save = view.getByTestId('cf-save-button')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('conditional-format-dialog-title')
    expect(dialog.getAttribute('aria-describedby')).toBe('conditional-format-rule-preview')
    await waitFor(() => expect(document.activeElement).toBe(close))

    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(view.queryByTestId('conditional-format-dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('opens an existing rule through its core draft command and submits it from the form', async () => {
    const store = createStore()
    const setConditionalFormatRule = jest.fn(async (request: SetConditionalFormatRuleRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
    }))
    store.setter(setConditionalFormatRulesAtom, {
      sheetId: 'sheet-1',
      rules: [CELL_VALUE_ENTRY, FORMULA_ENTRY],
    })
    store.setter(openConditionalFormatEditorAtom, CELL_VALUE_ENTRY)
    const view = renderDialog(store, createBackend(setConditionalFormatRule))

    const formulaRule = await waitFor(() => view.getByTestId('cf-rule-entry-rule-formula'))
    fireEvent.click(formulaRule)
    await waitFor(() =>
      expect(store.getter(conditionalFormatEditorAtom).ruleId).toBe('rule-formula'),
    )
    expect(formulaRule.getAttribute('aria-current')).toBe('true')
    expect(view.container.querySelector<HTMLElement>('.cf-rule-preview')?.dataset.ruleKind).toBe(
      'formula',
    )

    fireEvent.submit(view.getByTestId('conditional-format-dialog'))
    await waitFor(() => expect(setConditionalFormatRule).toHaveBeenCalledTimes(1))
    expect(setConditionalFormatRule.mock.calls[0][0]).toMatchObject({
      ruleId: 'rule-formula',
      rule: { kind: 'formula', formula: '=A1>10' },
    })
  })

  it('associates an Atom-backed unknown outcome with the dialog and preserves the blocked retry path', async () => {
    const store = createStore()
    const setConditionalFormatRule = jest.fn(async () => {
      throw new Error('connection interrupted')
    })
    store.setter(setConditionalFormatRulesAtom, { sheetId: 'sheet-1', rules: [CELL_VALUE_ENTRY] })
    store.setter(openConditionalFormatEditorAtom, CELL_VALUE_ENTRY)
    const view = renderDialog(store, createBackend(setConditionalFormatRule))

    fireEvent.submit(await waitFor(() => view.getByTestId('conditional-format-dialog')))
    const error = await waitFor(() => view.getByTestId('cf-error-text'))
    expect(error.id).toBe('conditional-format-dialog-error')
    expect(view.getByTestId('conditional-format-dialog').getAttribute('aria-describedby')).toBe(
      error.id,
    )

    fireEvent.submit(view.getByTestId('conditional-format-dialog'))
    await waitFor(() => expect(error.textContent).toContain('unknown outcome'))
    expect(setConditionalFormatRule).toHaveBeenCalledTimes(1)
  })
})
