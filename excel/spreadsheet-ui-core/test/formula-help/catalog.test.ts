import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { nativeFunctionCatalogAtom, setRustWorkbookConnectionAtom } from '../../src'
import { validateFunctionCatalog } from '../../src/formula-functions/native-catalog'
import type { NativeFunctionCatalog } from '../../src/formula-functions/types'
import { hydrateCustomFormulaDefinitionsAtom } from '../../src/custom-formulas/expression-catalog'
import { installTestFunctionCatalog } from '../support/function-catalog'
import { HELP_CATALOG } from './fixtures'

test('v2 consumes only complete native help, retaining semantics and examples', () => {
  const store = createStore()
  installTestFunctionCatalog(store, HELP_CATALOG)
  const spec = store.getter(nativeFunctionCatalogAtom).find((entry) => entry.name === 'LET')!
  expect(spec).toMatchObject({ signatureAvailable: true, summaryZh: '原生含义。',
    repeat: { start: 0, length: 2, minGroups: 1 }, examples: ['=LET(x,1,x)'] })
  expect(spec.args[0]).toMatchObject({ description: 'Meaning of name.', descriptionZh: 'name 的含义。' })
  store.setter(setRustWorkbookConnectionAtom, null)
  expect(store.getter(nativeFunctionCatalogAtom)).toEqual([])
})

test('nonrepeating help accepts omitted, undefined or null groups but never repeating parameters', () => {
  const entry = HELP_CATALOG.functions.find((item) => item.name === 'NORM.S.DIST')!
  const { repeat: _repeat, ...omitted } = entry.help!
  for (const help of [omitted, { ...omitted, repeat: undefined }, { ...omitted, repeat: null }]) {
    expect(() =>
      validateFunctionCatalog({ version: 2, functions: [{ ...entry, help }] }),
    ).not.toThrow()
    const repeated = { ...help, args: help.args.map((arg) => ({ ...arg, repeats: true })) }
    expect(() =>
      validateFunctionCatalog({ version: 2, functions: [{ ...entry, help: repeated }] }),
    ).toThrow()
  }
})

test('v2 rejects missing help, incomplete semantics, false repeat groups and alias-mismatched examples', () => {
  const entry = HELP_CATALOG.functions[0]
  for (const bad of [
    { ...entry, help: undefined },
    { ...entry, help: { ...entry.help, summary_zh: '' } },
    { ...entry, help: { ...entry.help, args: [{ name: 'args', optional: false, repeats: true }] } },
    { ...entry, help: { ...entry.help, repeat: { start: 0, length: 3, min_groups: 1 } } },
    { ...entry, help: { ...entry.help, repeat: null } },
    { ...entry, help: { ...entry.help, repeat: undefined } },
    { ...entry, help: { ...entry.help, repeat: {} } },
    { ...entry, help: { ...entry.help, repeat: { start: 0, length: 2, min_groups: 0 } } },
    { ...entry, help: { ...entry.help, examples: ['=OTHER(1)'] } },
  ])
    expect(() =>
      validateFunctionCatalog({ version: 2, functions: [bad] } as NativeFunctionCatalog),
    ).toThrow()
})

test('v1 is compatible with existing hosts without inventing complete signatures', () => {
  const store = createStore()
  installTestFunctionCatalog(store, { version: 1, functions: [{ name: 'MAP', category: 'Arrays' }] })
  expect(store.getter(nativeFunctionCatalogAtom)[0].signatureAvailable).toBe(false)
})

test('native custom definitions update the same catalog with no request or workbook mutation', () => {
  const store = createStore()
  const { connection, request } = installTestFunctionCatalog(store, HELP_CATALOG)
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [
    { name: 'DOUBLE', parameters: ['X'], expression: '=X*2' },
  ] })
  expect(store.getter(nativeFunctionCatalogAtom).at(-1)).toMatchObject({ name: 'DOUBLE', args: [{ name: 'X' }] })
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [] })
  expect(store.getter(nativeFunctionCatalogAtom).some((entry) => entry.name === 'DOUBLE')).toBe(false)
  expect(request).not.toHaveBeenCalled()
})
