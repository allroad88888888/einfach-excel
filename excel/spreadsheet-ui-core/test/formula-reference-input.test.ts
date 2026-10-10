import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  startEditingAtom,
  cancelEditingAtom,
  editingDraftAtom,
  updateFormulaDraftAtom,
  syncFormulaReferenceCaretAtom,
  formulaReferenceSessionAtom,
  toggleFormulaReferenceAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  startPointerSelectionAtom,
  updatePointerSelectionAtom,
  endPointerSelectionAtom,
  parseFormulaReferences,
} from '../src'

function setup(draft = '=') {
  const store = createStore()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 9, col: 1 } })
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 9, col: 1 }, draft, source: 'cell' })
  store.setter(syncFormulaReferenceCaretAtom, draft.length)
  return store
}

test('pointer picking replaces its token, leaves the workbook selection alone and survives pointer-up', () => {
  const store = setup('=SUM(')
  const selection = store.getter(selectionSnapshotAtom)
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 3, col: 2 } })
  store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B2:C4')
  store.setter(endPointerSelectionAtom)
  expect(store.getter(formulaReferenceSessionAtom)?.dragging).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toEqual(selection)
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 5, col: 0 } })
  expect(store.getter(editingDraftAtom)).toBe('=SUM(A6')
  store.setter(updateFormulaDraftAtom, { draft: '=SUM(A6,', caret: 8 })
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 6, col: 0 } })
  expect(store.getter(editingDraftAtom)).toBe('=SUM(A6,A7')
})

test('cancel and a new session clear the previous reference token', () => {
  const store = setup()
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
  store.setter(cancelEditingAtom)
  expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
  store.setter(startEditingAtom, {
    sheetId: 's',
    cell: { row: 9, col: 1 },
    draft: '=',
    source: 'cell',
  })
  store.setter(syncFormulaReferenceCaretAtom, 1)
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 2, col: 0 } })
  expect(store.getter(editingDraftAtom)).toBe('=A3')
})

test.each(['plain+', '="text,', "'=", '=SUM(1)'])(
  'ordinary text and completed expressions do not enter reference mode: %s',
  (draft) => {
    expect(setup(draft).getter(formulaReferenceSessionAtom)).toBeNull()
  },
)

test('manual caret movement ends the old pick; typing at an operator resumes it', () => {
  const store = setup()
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
  store.setter(syncFormulaReferenceCaretAtom, 0)
  expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
  store.setter(updateFormulaDraftAtom, { draft: '=A2+', caret: 4 })
  expect(store.getter(formulaReferenceSessionAtom)?.insertionCaret).toBe(4)
})

test('F4 cycles the current reference without touching adjacent numbers or quoted references', () => {
  const store = setup('=A1+"B2"+12')
  let caret = 2
  for (const expected of ['=$A$1+"B2"+12', '=A$1+"B2"+12', '=$A1+"B2"+12', '=A1+"B2"+12']) {
    caret = store.setter(toggleFormulaReferenceAtom, { start: caret, end: caret })!
    expect(store.getter(editingDraftAtom)).toBe(expected)
  }
  expect(store.setter(toggleFormulaReferenceAtom, { start: 7, end: 7 })).toBeNull()
})

test('F4 preserves quoted sheet names and cycles both ends of selected ranges', () => {
  const store = setup("=SUM('A1 data'!b2:c3)")
  store.setter(toggleFormulaReferenceAtom, { start: 6, end: 18 })
  expect(store.getter(editingDraftAtom)).toBe("=SUM('A1 data'!$b$2:$c$3)")
})

test('reference scanner ignores strings, escaped strings, function names and identifier fragments', () => {
  const tokens = parseFormulaReferences(
    '=LOG10(a1)+"B2"+"say ""C3"""+A1_name+XFE1+A1048577+$D$4',
    's',
  )
  expect(tokens.map((token) => token.text)).toEqual(['a1', '$D$4'])
  expect(parseFormulaReferences('="unfinished A1', 's')).toEqual([])
})
