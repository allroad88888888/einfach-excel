import type { Store } from '@einfach/core'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import type { WorkerLike } from '@einfach-excel/spreadsheet-ui-core/rust-worker'
import type { CSSProperties } from 'react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type {
  SpreadsheetProps,
  WorkbookRuntimeProviderProps,
  WorkbookStoreProviderProps,
  WorkbookViewProps,
} from '../../src'

vi.mock('../../src/page/demo/demo-registry', () => {
  throw new Error('The public entry must not read demo definitions')
})
vi.mock('../../src/page/demo/demo-presentation', () => {
  throw new Error('The public entry must not load demo locale or URL preferences')
})

afterEach(() => vi.unstubAllGlobals())

describe('public package entry', () => {
  it('exports only the supported React components without creating a Worker', async () => {
    const worker = vi.fn(() => { throw new Error('Unexpected Worker on import') })
    vi.stubGlobal('Worker', worker)
    const read = vi.spyOn(Storage.prototype, 'getItem')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const entry = await import('../../src')
    expect(Object.keys(entry).sort()).toEqual([
      'Spreadsheet', 'WorkbookRuntimeProvider', 'WorkbookStoreProvider', 'WorkbookView',
    ])
    for (const component of Object.values(entry)) expect(component).toBeTypeOf('function')
    expect(worker).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('exposes the browser React18 input contract through the root', () => {
    expectTypeOf<SpreadsheetProps['definition']>().toEqualTypeOf<RustWorkbookDefinition>()
    expectTypeOf<SpreadsheetProps['store']>().toEqualTypeOf<Store | undefined>()
    expectTypeOf<SpreadsheetProps['workerFactory']>().toEqualTypeOf<(() => WorkerLike) | undefined>()
    expectTypeOf<SpreadsheetProps['style']>().toEqualTypeOf<CSSProperties | undefined>()
    expectTypeOf<SpreadsheetProps['className']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<SpreadsheetProps['locale']>().toEqualTypeOf<'en' | 'zh' | undefined>()
    expectTypeOf<SpreadsheetProps['renderer']>().toEqualTypeOf<'dom' | 'canvas' | undefined>()
    expectTypeOf<WorkbookRuntimeProviderProps['workerFactory']>()
      .toEqualTypeOf<SpreadsheetProps['workerFactory']>()
    expectTypeOf<WorkbookStoreProviderProps['store']>().toEqualTypeOf<Store | undefined>()
    expectTypeOf<WorkbookViewProps>().toEqualTypeOf<Record<string, never>>()
  })
})
