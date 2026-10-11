import type { Store } from '@einfach/core'
import { vi } from 'vitest'
import { FORMULA_FUNCTION_SPECS, publishNativeFunctionCatalogAtom, setRustWorkbookConnectionAtom,
  type NativeFunctionCatalog, type RustWorkbookConnection } from '../../src'

/** Controlled metadata fixture, not the product's available-function authority. */
export const TEST_FUNCTION_CATALOG: NativeFunctionCatalog = { version: 1,
  functions: FORMULA_FUNCTION_SPECS.map(({ name }) => ({ name, category: 'Test', note: null })) }

export function installTestFunctionCatalog(store: Store, catalog = TEST_FUNCTION_CATALOG) {
  const request = vi.fn()
  const connection: RustWorkbookConnection = { request, dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(publishNativeFunctionCatalogAtom, { connection, catalog })
  return { connection, request }
}
