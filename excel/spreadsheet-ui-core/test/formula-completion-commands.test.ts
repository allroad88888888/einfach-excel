import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  startEditingAtom, cancelEditingAtom, updateFormulaDraftAtom, editingDraftAtom,
  formulaFunctionSuggestionsAtom, formulaFunctionSuggestionCursorAtom,
  formulaFunctionSignatureAtom, formulaReferenceSessionAtom, syncFormulaReferenceCaretAtom,
} from '../src'
import { acceptFormulaSuggestionAtom, dispatchFormulaSuggestionKeyAtom } from '../src/editing/formula-input-commands'

function setup(draft = '=SU') {
  const store = createStore()
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, draft, source: 'cell' })
  store.setter(syncFormulaReferenceCaretAtom, draft.length)
  return store
}

test('keyboard chooses a candidate and accepts it into the existing draft, opening reference picking', () => {
  const store = setup()
  expect(store.setter(dispatchFormulaSuggestionKeyAtom, 'ArrowDown')).toEqual({ handled: true })
  expect(store.getter(formulaFunctionSuggestionCursorAtom)).toBe(1)
  expect(store.setter(dispatchFormulaSuggestionKeyAtom, 'Tab')).toEqual({ handled: true, caret: 7 })
  expect(store.getter(editingDraftAtom)).toBe('=SUMIF(')
  expect(store.getter(formulaReferenceSessionAtom)?.insertionCaret).toBe(7)
  expect(store.getter(formulaFunctionSignatureAtom)?.activeArgIndex).toBe(0)
})

test('Escape dismisses suggestions only, but typing at the same caret or restarting restores them', () => {
  const store = setup()
  store.setter(dispatchFormulaSuggestionKeyAtom, 'Escape')
  expect(store.getter(editingDraftAtom)).toBe('=SU')
  expect(store.getter(formulaFunctionSuggestionsAtom)).toEqual([])
  expect(store.setter(dispatchFormulaSuggestionKeyAtom, 'Escape')).toEqual({ handled: false })
  store.setter(updateFormulaDraftAtom, { draft: '=CO', caret: 3 })
  expect(store.getter(formulaFunctionSuggestionsAtom)[0].spec.name).toBe('COUNT')
  store.setter(dispatchFormulaSuggestionKeyAtom, 'Escape')
  store.setter(cancelEditingAtom)
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, draft: '=CO', source: 'cell' })
  store.setter(syncFormulaReferenceCaretAtom, 3)
  expect(store.getter(formulaFunctionSuggestionsAtom).length).toBeGreaterThan(0)
})

test('candidate selection resets with the draft and stale pointer choices cannot replace another fragment', () => {
  const store = setup()
  store.setter(dispatchFormulaSuggestionKeyAtom, 'ArrowDown')
  store.setter(updateFormulaDraftAtom, { draft: '=RO', caret: 3 })
  expect(store.getter(formulaFunctionSuggestionCursorAtom)).toBe(0)
  expect(store.setter(acceptFormulaSuggestionAtom, 'SUMIF')).toBeNull()
  expect(store.setter(acceptFormulaSuggestionAtom, 'ROUND')).toBe(7)
  expect(store.getter(editingDraftAtom)).toBe('=ROUND(')
})

test.each(['="SU', '=CONCAT("SU', "='SU", '=Sheet!SU', '=1SU', '=A1_SU'])(
  'does not offer function completions inside text, sheet names, or reference fragments: %s', (draft) => {
    expect(setup(draft).getter(formulaFunctionSuggestionsAtom)).toEqual([])
  },
)

test('signature counts commas only in the current call, not strings, nested calls, or arrays', () => {
  for (const [draft, name, activeArgIndex] of [
    ['=IF(TRUE,"unfinished,', 'IF', 1],
    ['=IF(SUM(1,2),', 'IF', 1],
    ["=IF('odd,(sheet'!A1,", 'IF', 1],
    ['=IF({1,2},', 'IF', 1],
    ['=IF((1+2),', 'IF', 1],
    ['=IF(TRUE,SUM(', 'SUM', 0],
  ] as const) {
    expect(setup(draft).getter(formulaFunctionSignatureAtom)).toMatchObject({
      spec: { name }, activeArgIndex,
    })
  }
})
