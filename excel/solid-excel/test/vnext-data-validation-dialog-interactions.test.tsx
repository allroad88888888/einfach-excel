/** @jsxImportSource solid-js */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  RangeProjectionRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  dataValidationMutationBlockedAtom,
  openValidationRuleEditorAtom,
  validationRuleEditorAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetDataValidationDialog } from '../src/data-validation'
import { setLocale } from '../src/i18n'
import { SpreadsheetUiProvider } from '../src/provider'

const testRange = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 }

afterEach(cleanup)

beforeEach(() => {
  setLocale('en')
})

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection(request: RangeProjectionRequest) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        range: request.range,
        cells: [],
      }
    },
    async setCellInput(request) {
      return { sheetId: request.sheetId, requestId: request.requestId }
    },
    async setValidationRule(request) {
      return { sheetId: request.sheetId, requestId: request.requestId }
    },
    async clearValidationRule(request) {
      return { sheetId: request.sheetId, requestId: request.requestId }
    },
  }
}

describe('SpreadsheetDataValidationDialog interactions', () => {
  it('announces itself as a modal dialog, traps focus, and restores focus after Escape', async () => {
    const store = createStore()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    store.setter(openValidationRuleEditorAtom, { range: testRange })

    const view = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetDataValidationDialog sheetId="sheet-1" />
      </SpreadsheetUiProvider>
    ))

    const dialog = await waitFor(() => view.getByTestId('validation-dialog'))
    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByTestId('validation-kind-select')),
    )
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('data-validation-dialog-title')
    expect(dialog.getAttribute('aria-describedby')).toBe('data-validation-dialog-range')
    expect(view.getByTestId('validation-range').tagName).toBe('OUTPUT')
    expect(view.getByTestId('validation-rule-form')).toBeTruthy()
    expect(view.getByTestId('validation-clear-button').getAttribute('data-variant')).toBe('danger')

    const save = view.getByTestId('validation-save-button')
    save.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(view.getByTestId('dialog-close-x'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(store.getter(validationRuleEditorAtom).status).toBe('closed'))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    trigger.remove()
  })

  it('announces mutation progress while rule actions are disabled', async () => {
    const store = createStore()
    const backend = createBackend()
    backend.setValidationRule = () => new Promise(() => undefined)
    store.setter(openValidationRuleEditorAtom, { range: testRange })

    const view = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDataValidationDialog sheetId="sheet-1" />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(await waitFor(() => view.getByTestId('validation-save-button')))

    await waitFor(() =>
      expect(view.getByTestId('validation-dialog').getAttribute('aria-busy')).toBe('true'),
    )
    expect(view.getByTestId('validation-pending-text').textContent).toBe('Loading')
    expect((view.getByTestId('validation-save-button') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('validation-clear-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('blocks more mutations after an unknown outcome but keeps cancellation available', async () => {
    const store = createStore()
    const backend = createBackend()
    backend.setValidationRule = async () => {
      throw new Error('offline')
    }
    store.setter(openValidationRuleEditorAtom, { range: testRange })

    const view = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDataValidationDialog sheetId="sheet-1" />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(await waitFor(() => view.getByTestId('validation-save-button')))
    const error = await waitFor(() => view.getByTestId('validation-error-text'))
    expect(error.textContent).toContain('offline')
    expect(store.getter(dataValidationMutationBlockedAtom)).toBe(true)
    expect((view.getByTestId('validation-save-button') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('validation-clear-button') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('validation-cancel-button') as HTMLButtonElement).disabled).toBe(false)
    expect(view.getByTestId('validation-dialog').getAttribute('aria-describedby')).toBe(
      'data-validation-dialog-range data-validation-dialog-error',
    )

    fireEvent.click(view.getByTestId('validation-cancel-button'))
    await waitFor(() => expect(store.getter(validationRuleEditorAtom).status).toBe('closed'))

    store.setter(openValidationRuleEditorAtom, { range: testRange })
    await waitFor(() => expect(document.activeElement).toBe(view.getByTestId('dialog-close-x')))
  })
})
