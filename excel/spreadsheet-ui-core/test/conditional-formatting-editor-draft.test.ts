import { describe, expect, test, vi } from 'vitest'
import { createStore, type Store } from '@einfach/core'
import {
  conditionalFormatEditorAtom,
  conditionalFormatEditorValidationAtom,
  openConditionalFormatEditorAtom,
  runConditionalFormatMutationAtom,
  setConditionalFormatEditorKindAtom,
  setConditionalFormatRulesAtom,
  setSelectionAtom,
  setWorkspaceActiveSheetAtom,
  updateConditionalFormatEditorDraftAtom,
  useSelectionForConditionalFormatEditorScopeAtom,
  type ConditionalFormatRuleEntry,
  type ConditionalFormatScope,
  type SetConditionalFormatRuleRequest,
} from '../src'

const SCOPE: ConditionalFormatScope = {
  range: { rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 },
}

const ENTRY: ConditionalFormatRuleEntry = {
  id: 'existing-rule',
  priority: 1,
  scope: SCOPE,
  rule: { kind: 'cell-value', operator: 'gt', value: '10', format: { bold: true } },
}

function prepare(store: Store): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
  store.setter(setConditionalFormatRulesAtom, { sheetId: 'sheet-a', rules: [ENTRY] })
  store.setter(openConditionalFormatEditorAtom, ENTRY)
}

function draft(store: Store) {
  return store.getter(conditionalFormatEditorAtom).draft!
}

describe('conditional-format editor draft', () => {
  test('copies the current selection into an atom-backed editable range', () => {
    const store = createStore()
    prepare(store)
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-a',
      anchor: { row: 4, col: 5 },
      focus: { row: 6, col: 7 },
    })

    store.setter(useSelectionForConditionalFormatEditorScopeAtom)
    store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'priority', priority: 4 })
    store.setter(updateConditionalFormatEditorDraftAtom, {
      kind: 'rule',
      rule: { ...draft(store).rule, value: '42' },
    })

    expect(draft(store)).toMatchObject({
      scope: { range: { rowStart: 4, rowEnd: 6, colStart: 5, colEnd: 7 } },
      priority: 4,
      rule: { kind: 'cell-value', value: '42' },
    })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toBeNull()
  })

  test('keeps every supported rule kind editable and valid', () => {
    const store = createStore()
    prepare(store)
    const cases = [
      {
        kind: 'cell-value' as const,
        rule: {
          kind: 'cell-value' as const,
          operator: 'between' as const,
          value: '1',
          value2: '2',
          format: {},
        },
      },
      {
        kind: 'formula' as const,
        rule: { kind: 'formula' as const, formula: '=A1>0', format: {} },
      },
      {
        kind: 'data-bar' as const,
        rule: { kind: 'data-bar' as const, minColor: '#111', maxColor: '#eee' },
      },
      {
        kind: 'color-scale' as const,
        rule: {
          kind: 'color-scale' as const,
          minColor: '#f00',
          midColor: '#ff0',
          maxColor: '#0f0',
        },
      },
      {
        kind: 'top-bottom' as const,
        rule: {
          kind: 'top-bottom' as const,
          direction: 'bottom' as const,
          count: 5,
          percent: true,
          format: {},
        },
      },
    ]

    for (const current of cases) {
      store.setter(setConditionalFormatEditorKindAtom, current.kind)
      store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'rule', rule: current.rule })
      expect(draft(store).rule).toEqual(current.rule)
      expect(store.getter(conditionalFormatEditorValidationAtom)).toBeNull()
    }
  })

  test('blocks invalid range, priority, and rule values before transport', async () => {
    const store = createStore()
    const setRule = vi.fn(async (request: SetConditionalFormatRuleRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
    }))
    prepare(store)
    store.setter(updateConditionalFormatEditorDraftAtom, {
      kind: 'scope',
      scope: { range: { rowStart: -1, rowEnd: 3, colStart: 2, colEnd: 4 } },
    })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toContain('range')

    store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'scope', scope: SCOPE })
    store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'priority', priority: -1 })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toContain('priority')
    await store.setter(runConditionalFormatMutationAtom, {
      action: 'save',
      sheetId: 'sheet-a',
      scope: SCOPE,
      setRule,
    })
    expect(setRule).not.toHaveBeenCalled()

    store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'priority', priority: 1 })
    store.setter(setConditionalFormatEditorKindAtom, 'cell-value')
    store.setter(updateConditionalFormatEditorDraftAtom, {
      kind: 'rule',
      rule: { kind: 'cell-value', operator: 'between', value: '1', format: {} },
    })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toContain('second comparison')

    store.setter(setConditionalFormatEditorKindAtom, 'formula')
    store.setter(updateConditionalFormatEditorDraftAtom, {
      kind: 'rule',
      rule: { kind: 'formula', formula: ' ', format: {} },
    })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toContain('formula')

    store.setter(setConditionalFormatEditorKindAtom, 'top-bottom')
    store.setter(updateConditionalFormatEditorDraftAtom, {
      kind: 'rule',
      rule: { kind: 'top-bottom', direction: 'top', count: 0, format: {} },
    })
    expect(store.getter(conditionalFormatEditorValidationAtom)).toContain('positive')
  })

  test('does not edit a draft captured for a no-longer-active sheet', () => {
    const store = createStore()
    prepare(store)
    const before = store.getter(conditionalFormatEditorAtom)
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-b' })

    store.setter(setConditionalFormatEditorKindAtom, 'formula')
    store.setter(updateConditionalFormatEditorDraftAtom, { kind: 'priority', priority: 9 })

    expect(store.getter(conditionalFormatEditorAtom)).toEqual(before)
  })
})
