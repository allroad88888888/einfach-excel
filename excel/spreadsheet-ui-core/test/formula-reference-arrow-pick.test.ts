import { createStore } from '@einfach/core'
import { describe, expect, it } from '@jest/globals'
import { applyFormulaReferenceArrowPick } from '../src'
import { editingSessionAtom, startEditingAtom } from '../src/editing'
import { enterFormulaReferenceAtom, formulaReferenceSessionAtom } from '../src/formula-reference'

function makeStore() {
  const store = createStore()
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 5, col: 6 },
    draft: '=',
    source: 'cell',
  })
  store.setter(enterFormulaReferenceAtom, {
    anchorCell: { row: 5, col: 6 },
    sheetId: 'sheet-1',
    insertionCaret: 1,
    draft: '=',
  })
  return store
}

describe('formula-reference arrow picking', () => {
  it('moves from the latest focus across consecutive arrows', () => {
    const store = makeStore()
    applyFormulaReferenceArrowPick(store, {
      type: 'formulaReference.arrowPick',
      rowDelta: 1,
      colDelta: 0,
      extend: false,
    })
    applyFormulaReferenceArrowPick(store, {
      type: 'formulaReference.arrowPick',
      rowDelta: 1,
      colDelta: 0,
      extend: false,
    })

    expect(store.getter(editingSessionAtom).draft).toBe('=G8')
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({
      pickAnchor: { row: 7, col: 6 },
      pickFocus: { row: 7, col: 6 },
    })
  })

  it('holds the existing pick anchor while Shift extends its focus', () => {
    const store = makeStore()
    applyFormulaReferenceArrowPick(store, {
      type: 'formulaReference.arrowPick',
      rowDelta: 0,
      colDelta: -1,
      extend: false,
    })
    applyFormulaReferenceArrowPick(store, {
      type: 'formulaReference.arrowPick',
      rowDelta: -1,
      colDelta: 0,
      extend: true,
    })

    expect(store.getter(editingSessionAtom).draft).toBe('=F5:F6')
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({
      pickAnchor: { row: 5, col: 5 },
      pickFocus: { row: 4, col: 5 },
    })
  })
})
