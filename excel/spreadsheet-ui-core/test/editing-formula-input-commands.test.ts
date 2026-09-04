import { createStore } from '@einfach/core'
import { describe, expect, it } from 'vitest'
import {
  acceptFormulaSuggestion,
  editingDraftAtom,
  formulaFunctionSuggestionsAtom,
  formulaReferenceCaretAtom,
  formulaReferenceSessionAtom,
  readActiveFormulaSuggestion,
  startEditingAtom,
  syncFormulaReferenceCaret,
} from '../src'

describe('editing formula input commands', () => {
  it('enters formula-reference mode from a synchronized caret', () => {
    const store = createStore()
    store.setter(startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
      draft: '=',
      source: 'formula-bar',
    })

    syncFormulaReferenceCaret(store, 1)

    expect(store.getter(formulaReferenceCaretAtom)).toBe(1)
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({
      anchorCell: { row: 2, col: 3 },
      sheetId: 'sheet-1',
      insertionCaret: 1,
    })
  })

  it('accepts the highlighted suggestion and opens a reference pick for its first argument', () => {
    const store = createStore()
    store.setter(startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 0, col: 0 },
      draft: '=SU',
      source: 'cell',
    })
    syncFormulaReferenceCaret(store, 3)
    const suggestion = readActiveFormulaSuggestion(store)

    expect(suggestion).toEqual(store.getter(formulaFunctionSuggestionsAtom)[0])
    expect(suggestion?.spec.name).toBe('SUM')
    expect(acceptFormulaSuggestion(store, suggestion!)).toEqual({ draft: '=SUM(', caret: 5 })
    expect(store.getter(editingDraftAtom)).toBe('=SUM(')
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({ insertionCaret: 5 })
  })
})
