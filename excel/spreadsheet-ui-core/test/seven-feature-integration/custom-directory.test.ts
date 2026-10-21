import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, setRustWorkbookConnectionAtom, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '../../src'
import { readVisibleProjection } from '../../src/rust-workbook/visible-projection'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import { hydrateCustomFormulaDefinitionsAtom, nativeCustomFormulaDefinitionsAtom } from '../../src/custom-formulas/expression-catalog'
import { nativeFunctionCatalogAtom, publishNativeFunctionCatalogAtom } from '../../src/formula-functions/native-catalog'

const definition = (expression = '=AMOUNT*2') => ({ name: 'DOUBLE', parameters: ['AMOUNT'], expression })
const request: VisibleProjectionRequest = { kind: 'visible-window', sheetId: 's', requestId: 1,
  reason: 'viewport', window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 } }

test('scroll windows reuse one native custom directory per workbook revision and file instance', () => {
  let directory = [definition()]
  const read = vi.fn(() => JSON.stringify(directory))
  const workbook = { read_custom_formulas: read, read_sparse_range: () => [],
    snapshot_format_range: () => ({ cellStyles: [], rowStyles: [], columnStyles: [] }),
  } as unknown as WasmWorkbook
  const first = readVisibleProjection(workbook, 0, request, 1)
  const scrolled = readVisibleProjection(workbook, 0, { ...request, requestId: 2,
    window: { rowStart: 4, rowEnd: 7, colStart: 0, colEnd: 3 } }, 1)
  expect(read).toHaveBeenCalledTimes(1)
  expect(scrolled.customFormulaDefinitions).toBe(first.customFormulaDefinitions)

  directory = [definition('=AMOUNT*3')]
  expect(readVisibleProjection(workbook, 0, request, 2).customFormulaDefinitions?.[0].expression).toBe('=AMOUNT*3')
  directory = [definition()]
  expect(readVisibleProjection(workbook, 0, request, 3).customFormulaDefinitions?.[0].expression).toBe('=AMOUNT*2')
  expect(read).toHaveBeenCalledTimes(3)

  const opened = { ...workbook } as WasmWorkbook
  expect(readVisibleProjection(opened, 0, request, 1).customFormulaDefinitions).toEqual([
    definition(),
  ])
  expect(read).toHaveBeenCalledTimes(4)
})

test('identical directory hydration preserves references and custom changes do not rebuild builtin help', () => {
  const connection = { request: vi.fn(), dispose() {} } as RustWorkbookConnection
  const { store } = createSpreadsheetUi({ connection })
  store.setter(publishNativeFunctionCatalogAtom, { connection,
    catalog: { version: 1, functions: [{ name: 'SUM', category: 'Math & trig' }] } })
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [definition()] })
  const before = store.getter(nativeCustomFormulaDefinitionsAtom)
  const catalog = store.getter(nativeFunctionCatalogAtom)
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [definition()] })
  expect(store.getter(nativeCustomFormulaDefinitionsAtom)).toBe(before)
  expect(store.getter(nativeFunctionCatalogAtom)).toBe(catalog)

  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [definition('=AMOUNT*3')] })
  const changed = store.getter(nativeFunctionCatalogAtom)
  expect(changed).not.toBe(catalog)
  expect(changed[0]).toBe(catalog[0])
  expect(changed[1].summary).toBe('=AMOUNT*3')

  // Undo/file replacement must not retain a stale expression or old connection's directory.
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [definition()] })
  expect(store.getter(nativeFunctionCatalogAtom)[1].summary).toBe('=AMOUNT*2')
  const replacement = { request: vi.fn(), dispose() {} } as RustWorkbookConnection
  store.setter(setRustWorkbookConnectionAtom, replacement)
  expect(store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection: replacement, definitions: [] })
  expect(store.getter(nativeCustomFormulaDefinitionsAtom)).toEqual([])
})
