import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { TEST_FUNCTION_CATALOG } from './support/function-catalog'

afterEach(() => vi.unstubAllGlobals())
test('catalog is forwarded from WASM without initializing, scanning or changing a workbook', async () => {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn(), initialized = vi.fn(), construct = vi.fn()
  const catalog = vi.fn(() => TEST_FUNCTION_CATALOG)
  vi.stubGlobal('self', { postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => { receive = callback } })
  class Book { constructor() { construct() } }
  installRustWorkbookRuntime({
    default: initialized, WasmWorkbook: Book, function_catalog: catalog,
  })
  await receive({ data: { id: 1, command: 'formula.catalog', payload: {} } })
  expect(post).toHaveBeenCalledWith({ id: 1, ok: true, result: TEST_FUNCTION_CATALOG })
  expect(initialized).toHaveBeenCalledOnce()
  expect(catalog).toHaveBeenCalledOnce()
  expect(construct).not.toHaveBeenCalled()
})

test('missing native catalog reports an error, not a made-up fallback', async () => {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', { postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => { receive = callback } })
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: class {} })
  await receive({ data: { id: 1, command: 'formula.catalog', payload: {} } })
  expect(post.mock.lastCall?.[0]).toMatchObject({ id: 1, ok: false,
    error: { message: 'Rust function catalog is unavailable.' } })
})
