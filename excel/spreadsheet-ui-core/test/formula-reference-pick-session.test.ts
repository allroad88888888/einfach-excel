import { createStore } from '@einfach/core'
import { describe, expect, it } from 'vitest'
import { editingSessionAtom, startEditingAtom } from '../src/editing'
import {
  enterFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  pickFormulaReferenceAtom,
} from '../src/formula-reference'

function makeStore() {
  const store = createStore()
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 3, col: 4 },
    draft: '=',
    source: 'cell',
  })
  store.setter(enterFormulaReferenceAtom, {
    anchorCell: { row: 3, col: 4 },
    sheetId: 'sheet-1',
    insertionCaret: 1,
    draft: '=',
  })
  return store
}

describe('formula reference pick session', () => {
  it('keeps the latest range endpoints in the Core session', () => {
    const store = makeStore()

    store.setter(pickFormulaReferenceAtom, {
      pickAnchor: { row: 2, col: 2 },
      pickFocus: { row: 4, col: 3 },
      sheetId: 'sheet-1',
      dragging: false,
    })

    expect(store.getter(editingSessionAtom).draft).toBe('=C3:D5')
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({
      pickAnchor: { row: 2, col: 2 },
      pickFocus: { row: 4, col: 3 },
      tokenRange: { start: 1, end: 6 },
    })
  })
})
