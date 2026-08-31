/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  ConditionalFormatRuleEntry,
  ConditionalFormatRulesResult,
  ListConditionalFormatRulesRequest,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  conditionalFormatEditorAtom,
  conditionalFormatRulesCacheAtom,
  conditionalFormatRulesLoadAtom,
  openConditionalFormatEditorAtom,
  runConditionalFormatMutationAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetConditionalFormatDialog } from '../src/conditional-formatting'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

const ruleFor = (id: string): ConditionalFormatRuleEntry => ({
  id,
  priority: 1,
  scope: { range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 } },
  rule: { kind: 'cell-value', operator: 'gt', value: '10', format: { bold: true } },
})

function setActiveSheet(store: ReturnType<typeof createStore>, sheetId: string) {
  store.setter(workspaceSessionAtom, {
    activeSheetId: sheetId,
    viewportRevision: 0,
    projectionRequestRevision: 0,
    committedProjectionRequestRevision: 0,
  })
}

function createBackend(
  listConditionalFormatRules: NonNullable<SpreadsheetBackend['listConditionalFormatRules']>,
) {
  const setConditionalFormatRule = jest.fn(async (request: SetConditionalFormatRuleRequest) => ({
    sheetId: request.sheetId,
    requestId: request.requestId,
  }))
  const removeConditionalFormatRule = jest.fn(
    async (request: RemoveConditionalFormatRuleRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
    }),
  )
  const backend: SpreadsheetBackend = {
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
    async setCellInput(request) {
      return { sheetId: request.sheetId }
    },
    listConditionalFormatRules,
    setConditionalFormatRule,
    removeConditionalFormatRule,
  }
  return { backend, setConditionalFormatRule, removeConditionalFormatRule }
}

function renderDialog(store: ReturnType<typeof createStore>, backend: SpreadsheetBackend) {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetConditionalFormatDialog />
    </SpreadsheetUiProvider>
  ))
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function rulesResult(
  request: ListConditionalFormatRulesRequest,
  rules: readonly ConditionalFormatRuleEntry[],
): ConditionalFormatRulesResult {
  return { sheetId: request.sheetId, requestId: request.requestId, rules }
}

describe('conditional-format persisted-rule hydration', () => {
  it('hydrates persisted rules for the initially active sheet when the dialog opens', async () => {
    const store = createStore()
    setActiveSheet(store, 'sheet-a')
    const persisted = ruleFor('persisted-a')
    const listRules = jest.fn(async (request: ListConditionalFormatRulesRequest) =>
      rulesResult(request, [persisted]),
    )
    const { backend } = createBackend(listRules)
    const view = renderDialog(store, backend)

    store.setter(openConditionalFormatEditorAtom, null)

    await waitFor(() => expect(view.getByTestId('cf-rule-entry-persisted-a')).toBeTruthy())
    expect(listRules).toHaveBeenCalledWith(expect.objectContaining({ sheetId: 'sheet-a' }))
    expect(store.getter(conditionalFormatRulesCacheAtom)).toMatchObject({
      sheetId: 'sheet-a',
      rules: [expect.objectContaining({ id: 'persisted-a' })],
    })
  })

  it('ignores a delayed persisted-rules response after the active sheet changes', async () => {
    const store = createStore()
    setActiveSheet(store, 'sheet-a')
    const pending = new Map<string, ReturnType<typeof deferred<ConditionalFormatRulesResult>>>()
    const listRules = jest.fn((request: ListConditionalFormatRulesRequest) => {
      const next = deferred<ConditionalFormatRulesResult>()
      pending.set(request.sheetId, next)
      return next.promise
    })
    const { backend } = createBackend(listRules)
    const view = renderDialog(store, backend)

    store.setter(openConditionalFormatEditorAtom, null)
    await waitFor(() => expect(pending.has('sheet-a')).toBe(true))
    expect(view.getByTestId('conditional-format-dialog').getAttribute('aria-busy')).toBe('true')
    expect(view.getByTestId('cf-rule-list').getAttribute('aria-busy')).toBe('true')
    setActiveSheet(store, 'sheet-b')
    await waitFor(() => expect(pending.has('sheet-b')).toBe(true))

    const oldRequest = listRules.mock.calls[0][0] as ListConditionalFormatRulesRequest
    pending.get('sheet-a')!.resolve(rulesResult(oldRequest, [ruleFor('old-a')]))
    await waitFor(() =>
      expect(store.getter(conditionalFormatRulesCacheAtom).sheetId).toBe('sheet-b'),
    )
    expect(view.queryByTestId('cf-rule-entry-old-a')).toBeNull()

    const newRequest = listRules.mock.calls[1][0] as ListConditionalFormatRulesRequest
    pending.get('sheet-b')!.resolve(rulesResult(newRequest, [ruleFor('current-b')]))
    await waitFor(() => expect(view.getByTestId('cf-rule-entry-current-b')).toBeTruthy())
    expect(view.getByTestId('conditional-format-dialog').getAttribute('aria-busy')).toBe('false')
    expect(view.getByTestId('cf-rule-list').getAttribute('aria-busy')).toBe('false')
    expect(store.getter(conditionalFormatRulesCacheAtom).rules[0]?.id).toBe('current-b')
  })

  it('fails closed for a stale selection and binds edit and delete to the current sheet', async () => {
    const store = createStore()
    const staleRule = ruleFor('rule-a')
    const currentRule = ruleFor('rule-b')
    setActiveSheet(store, 'sheet-a')
    const listRules = jest.fn(async (request: ListConditionalFormatRulesRequest) =>
      rulesResult(request, request.sheetId === 'sheet-a' ? [staleRule] : [currentRule]),
    )
    const { backend, setConditionalFormatRule, removeConditionalFormatRule } =
      createBackend(listRules)
    const view = renderDialog(store, backend)

    store.setter(openConditionalFormatEditorAtom, null)
    await waitFor(() => expect(view.getByTestId('cf-rule-entry-rule-a')).toBeTruthy())
    setActiveSheet(store, 'sheet-b')
    await waitFor(() => expect(view.getByTestId('cf-rule-entry-rule-b')).toBeTruthy())

    store.setter(openConditionalFormatEditorAtom, staleRule)
    expect(store.getter(conditionalFormatEditorAtom).ruleId).toBeNull()
    expect(view.getByTestId('cf-remove-button').hasAttribute('disabled')).toBe(true)
    expect(removeConditionalFormatRule).not.toHaveBeenCalled()

    await waitFor(() => expect(store.getter(conditionalFormatRulesLoadAtom).phase).toBe('ready'))
    fireEvent.click(view.getByTestId('cf-rule-entry-rule-b'))
    await store.setter(runConditionalFormatMutationAtom, {
      action: 'save',
      sheetId: 'sheet-a',
      scope: currentRule.scope,
      setRule: backend.setConditionalFormatRule,
    })
    expect(setConditionalFormatRule).not.toHaveBeenCalled()
    fireEvent.submit(view.getByTestId('conditional-format-dialog'))
    await waitFor(() => expect(setConditionalFormatRule).toHaveBeenCalledTimes(1))
    expect(setConditionalFormatRule.mock.calls[0][0]).toMatchObject({
      sheetId: 'sheet-b',
      ruleId: 'rule-b',
    })

    await waitFor(() => expect(view.queryByTestId('conditional-format-dialog')).toBeNull())
    store.setter(openConditionalFormatEditorAtom, null)
    await waitFor(() => expect(view.getByTestId('cf-rule-entry-rule-b')).toBeTruthy())
    await waitFor(() => expect(store.getter(conditionalFormatRulesLoadAtom).phase).toBe('ready'))
    fireEvent.click(view.getByTestId('cf-rule-entry-rule-b'))
    fireEvent.click(view.getByTestId('cf-remove-button'))
    await waitFor(() => expect(removeConditionalFormatRule).toHaveBeenCalledTimes(1))
    expect(removeConditionalFormatRule.mock.calls[0][0]).toMatchObject({
      sheetId: 'sheet-b',
      ruleId: 'rule-b',
    })
  })
})
