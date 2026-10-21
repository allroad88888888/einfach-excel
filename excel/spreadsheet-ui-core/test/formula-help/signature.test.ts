import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { editingDraftAtom, startEditingAtom, setFormulaReferenceCaretAtom,
  formulaFunctionSignatureAtom, nativeFunctionCatalogAtom, renderFormulaFunctionSignature } from '../../src'
import { findEnclosingFormulaHelpCall, findFunctionNameFragmentAtCaret } from '../../src/formula-functions/parse'
import { formulaHelpArgumentIndex } from '../../src/formula-functions/help/signature'
import { installTestFunctionCatalog } from '../support/function-catalog'
import { HELP_CATALOG } from './fixtures'

function signature(draft: string, caret = draft.length - 1) {
  const store = createStore()
  installTestFunctionCatalog(store, HELP_CATALOG)
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, draft, source: 'cell' })
  store.setter(editingDraftAtom, { draft })
  store.setter(setFormulaReferenceCaretAtom, caret)
  return store.getter(formulaFunctionSignatureAtom)
}

test('LET highlights each name/value pair and preserves its fixed final calculation', () => {
  const draft = '=LET(first,1,second,2,third,3,first+second+third)'
  for (const [token, expected] of [['first,', 0], ['1,', 1], ['second,', 0], ['2,', 1],
    ['third,', 0], ['3,', 1], ['first+second', 2]] as const) {
    const state = signature(draft, draft.indexOf(token) + token.length - 1)
    expect(state?.activeArgIndex, token).toBe(expected)
  }
  expect(signature('=LET(x,1,y,2,')?.activeArgIndex).toBe(1)
  expect(signature('=LET(x,1,y,2,', '=LET(x,1,y,2,'.length)?.activeArgIndex).toBe(2)
  const awaitingValue = '=LET(x,1,y,'
  expect(signature(awaitingValue, awaitingValue.length)?.activeArgIndex).toBe(1)
})

test('MAP maps every array back to the group and the actual final lambda to its suffix', () => {
  const draft = '=MAP({1,2},{3,4},{5,6},LAMBDA(a,b,c,a+b+c))'
  expect(signature(draft, draft.indexOf('{5,6}') + 5)?.activeArgIndex).toBe(0)
  const state = signature(draft, draft.indexOf('LAMBDA') + 1)
  expect(state?.spec.name).toBe('MAP')
  expect(state?.activeArgIndex).toBe(1)
})

test('SUMIFS cycles through complete range/criterion groups without clamping the tail', () => {
  const draft = '=SUMIFS(A1:A3,B1:B3,">0",C1:C3,"x",D1:D3,"y")'
  expect(signature(draft, draft.indexOf('D1') + 2)?.activeArgIndex).toBe(1)
  expect(signature(draft, draft.indexOf('"y"') + 2)?.activeArgIndex).toBe(2)
  const unfinished = '=SUMIFS(A1:A3,B1:B3,">0",'
  expect(signature(unfinished, unfinished.length)?.activeArgIndex).toBe(1)
})

test('SWITCH optional default is selected by pair parity, not clamping', () => {
  const withDefault = '=SWITCH(2,1,"one",2,"two","other")'
  expect(signature(withDefault, withDefault.indexOf('2,"two"') + 1)?.activeArgIndex).toBe(1)
  expect(signature(withDefault)?.activeArgIndex).toBe(3)
  expect(signature('=SWITCH(2,1,"one",2,"two")')?.activeArgIndex).toBe(2)
})

test('zero-parameter LAMBDA and multiple parameters retain the fixed body', () => {
  expect(signature('=LAMBDA(42)')?.activeArgIndex).toBe(1)
  const draft = '=LAMBDA(a,b,c,a+b+c)'
  expect(signature(draft, draft.indexOf('c,') + 1)?.activeArgIndex).toBe(0)
  expect(signature(draft)?.activeArgIndex).toBe(1)
})

test('AGGREGATE distinguishes conditional k from repeated arrays without evaluating dynamic codes', () => {
  expect(signature('=AGGREGATE(9,0,A1:A3,B1:B3)')?.activeArgIndex).toBe(2)
  expect(signature('=AGGREGATE(14,0,A1:A3,B1:B3,2)')?.activeArgIndex).toBe(3)
  expect(signature('=AGGREGATE(14.9,0,A1:A3,2)')?.activeArgIndex).toBe(3)
  const draft = '=AGGREGATE(14,0,A1:A3,B1:B3,2)'
  expect(signature(draft, draft.indexOf('B1') + 2)?.activeArgIndex).toBe(2)
  expect(signature('=AGGREGATE(Z1,0,A1:A3,2)')?.activeArgIndex).toBe(-1)
  expect(signature('=AGGREGATE(Z1,0,A1:A3)')?.activeArgIndex).toBe(2)
})

test('dotted names are parsed and completed with real native help', () => {
  expect(findFunctionNameFragmentAtCaret('=NORM.S.D', 9)?.text).toBe('NORM.S.D')
  const state = signature('=NORM.S.DIST(0,TRUE)')
  expect(state?.spec.name).toBe('NORM.S.DIST')
  expect(state?.activeArgIndex).toBe(1)
})

test('call size ignores quoted strings/sheets, nested calls, arrays and structured references', () => {
  const draft = '=LET(x,"a,""b,c",y,SUM({1,2;3,4}),Table1[[#Data],[a,b]])'
  const context = findEnclosingFormulaHelpCall(draft, draft.indexOf('Table1') + 2)
  expect(context).toMatchObject({ name: 'LET', activeArgIndex: 4, argumentCount: 5, closed: true })
  const quoted = '=SUMIFS(A1:A3,\'a,b\'!B1:B3,">0")'
  expect(findEnclosingFormulaHelpCall(quoted, quoted.length - 1)?.argumentCount).toBe(3)
})

test('zero-argument and excessive fixed arguments have no misleading active parameter', () => {
  expect(signature('=PI(', 4)?.activeArgIndex).toBe(-1)
  const store = createStore()
  installTestFunctionCatalog(store, HELP_CATALOG)
  const spec = store.getter(nativeFunctionCatalogAtom).find((entry) => entry.name === 'NORM.S.DIST')!
  expect(formulaHelpArgumentIndex(spec, 2, 3)).toBe(-1)
})

test('signature rendering marks pairs as one repeated group and retains fixed suffixes', () => {
  expect(renderFormulaFunctionSignature(signature('=LET(x,1,x)')!.spec))
    .toBe('LET((name, value), ..., calculation)')
  expect(renderFormulaFunctionSignature(signature('=SUMIFS(A1,A1,1)')!.spec))
    .toBe('SUMIFS(sum_range, (criteria_range, criteria), ...)')
})
