import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { nativeFunctionCatalogAtom, setRustWorkbookConnectionAtom, startEditingAtom,
  formulaFunctionSuggestionsAtom, formulaFunctionSignatureAtom, syncFormulaReferenceCaretAtom,
  type NativeFunctionCatalog } from '../src'
import { validateFunctionCatalog } from '../src/formula-functions/native-catalog'
import { installTestFunctionCatalog } from './support/function-catalog'

const catalog: NativeFunctionCatalog = { version: 1, functions: [
  { name: 'XLOOKUP', category: 'Lookup & reference', note: undefined },
  { name: 'SUM', category: 'Math & statistics', note: null },
  { name: 'IMAGE', category: 'Linked content', note: 'Returns metadata as text.' },
] }

test('only the current native catalog controls availability, with no static fallback', () => {
  const store = createStore()
  expect(store.getter(nativeFunctionCatalogAtom)).toEqual([])
  installTestFunctionCatalog(store, catalog)
  expect(store.getter(nativeFunctionCatalogAtom).map((entry) => entry.name)).toEqual(['SUM', 'IMAGE', 'XLOOKUP'])
  store.setter(setRustWorkbookConnectionAtom, null)
  expect(store.getter(nativeFunctionCatalogAtom)).toEqual([])
  installTestFunctionCatalog(store, { version: 1, functions: [catalog.functions[0]] })
  expect(store.getter(nativeFunctionCatalogAtom).map((entry) => entry.name)).toEqual(['XLOOKUP'])
})

test('new native names complete without inventing argument signatures; known help remains', () => {
  const store = createStore()
  installTestFunctionCatalog(store, catalog)
  const edit = (draft: string) => {
    store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft })
    store.setter(syncFormulaReferenceCaretAtom, draft.length)
  }
  edit('=XLO')
  expect(store.getter(formulaFunctionSuggestionsAtom)[0].spec.name).toBe('XLOOKUP')
  edit('=XLOOKUP(')
  expect(store.getter(formulaFunctionSignatureAtom)).toBeNull()
  edit('=SUM(')
  expect(store.getter(formulaFunctionSignatureAtom)?.spec.name).toBe('SUM')
  edit('=IF(')
  expect(store.getter(formulaFunctionSignatureAtom)).toBeNull()
  expect(store.getter(nativeFunctionCatalogAtom).find((entry) => entry.name === 'IMAGE')?.summary)
    .toBe('Returns metadata as text.')
})

test.each([null, {}, { ...catalog, version: 2 }, { ...catalog, functions: [] },
  { ...catalog, functions: [catalog.functions[0], catalog.functions[0]] },
  { ...catalog, functions: [{ name: 'sum', category: 'Math', note: null }] },
  { ...catalog, functions: [{ name: 'SUM', category: '', note: null }] },
  { ...catalog, functions: [{ name: 'SUM', category: 'Math', note: 42 }] },
])('invalid native metadata rejects: %j', (value) => {
  expect(() => validateFunctionCatalog(value as NativeFunctionCatalog)).toThrow('invalid function catalog')
})
