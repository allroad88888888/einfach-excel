import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { initializeWorkbookDocumentAtom, nativeFunctionCatalogAtom,
  publishNativeFunctionCatalogAtom,
  setRustWorkbookConnectionAtom, type NativeFunctionCatalog, type RustWorkbookConnection } from '../../src'
import { HELP_CATALOG, help } from '../formula-help/fixtures'
import { runFormulaArgumentsAtom, type FormulaArgumentsAction } from '../../src/formula-arguments'

export const ARGUMENT_CATALOG: NativeFunctionCatalog = { version: 2, functions: [
  ...HELP_CATALOG.functions,
  { name: 'SUM', category: 'Math', help: { ...help(['number'],
    { start: 0, length: 1, min_groups: 0 }), args: [{ name: 'number', description: 'Numbers or ranges.',
      description_zh: '数字或区域。', repeats: true, optional: true }], examples: ['=SUM(1,2,3)'] } },
  { name: 'IF', category: 'Logical', help: { ...help(['logical_test', 'value_if_true', 'value_if_false']),
    args: help(['logical_test', 'value_if_true', 'value_if_false']).args
      .map((arg, index) => ({ ...arg, optional: index === 2 })), examples: ['=IF(TRUE,1)'] } },
  { name: 'XLOOKUP', category: 'Lookup', help: { ...help([
    'lookup_value', 'lookup_array', 'return_array', 'if_not_found', 'match_mode', 'search_mode',
  ]), args: help(['lookup_value', 'lookup_array', 'return_array', 'if_not_found', 'match_mode', 'search_mode'])
    .args.map((arg, index) => ({ ...arg, optional: index > 2 })), examples: ['=XLOOKUP(1,{1},{2})'] } },
] }

export function setupArguments(catalog = ARGUMENT_CATALOG) {
  const store = createStore()
  const request = vi.fn()
  const connection: RustWorkbookConnection = { request, dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(initializeWorkbookDocumentAtom, { title: 'Arguments', sheets: [
    { id: 's', index: 0, name: 'Sheet 1', rowCount: 100, colCount: 10 },
    { id: 'other', index: 1, name: 'Other', rowCount: 100, colCount: 10 },
  ] })
  store.setter(publishNativeFunctionCatalogAtom, { connection, catalog })
  return { store, request, connection, catalog: store.getter(nativeFunctionCatalogAtom),
    run: (action: FormulaArgumentsAction) => store.setter(runFormulaArgumentsAtom, action) }
}
