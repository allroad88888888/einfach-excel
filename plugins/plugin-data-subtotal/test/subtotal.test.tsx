import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustWorkbookConnection, type SubtotalList, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { configureSubtotalAtom, subtotalPanelAtom } from '../src/core'
import { dataSubtotalPlugin } from '../src'

const sampleList: SubtotalList = {
  range: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 2 },
  fields: [
    { column: 0, name: 'Region' },
    { column: 1, name: 'Product' },
    { column: 2, name: 'Sales' },
  ],
  revision: 1,
}

async function createFixture(handlers: {
  inspect?: () => Promise<SubtotalList>
  change?: () => Promise<{ changed: boolean; range: SubtotalList['range']; edits: []; projection: unknown }>
} = {}) {
  const inspect = vi.fn(handlers.inspect ?? (async () => sampleList))
  const change = vi.fn(handlers.change ?? (async () => ({
    changed: false, range: sampleList.range, edits: [], projection: null,
  })))
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'subtotal.inspect') return inspect()
    if (command === 'subtotal.change') return change()
    return { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 }
  })
  const connection: RustWorkbookConnection = {
    request: request as RustWorkbookConnection['request'], dispose() {},
  }
  const core = createSpreadsheetUi({ connection })
  core.store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet1', index: 0, rowCount: 30, colCount: 8 }],
  })
  core.store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, {
    sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 4 },
  })
  return { store: core.store, inspect, change }
}

test('subtotal dialog inspects, allows closing while busy, and drops late responses', async () => {
  let resolveInspect!: (value: SubtotalList) => void
  const { store } = await createFixture({
    inspect: () => new Promise<SubtotalList>(resolve => { resolveInspect = resolve }),
  })
  const pending = store.setter(configureSubtotalAtom, 'open')
  await Promise.resolve()
  expect(store.getter(subtotalPanelAtom)?.busy).toBe(true)
  expect(await store.setter(configureSubtotalAtom, 'close')).toBe(true)
  expect(store.getter(subtotalPanelAtom)).toBeNull()
  resolveInspect(sampleList)
  expect(await pending).toBe(false)
  expect(store.getter(subtotalPanelAtom)).toBeNull()
})

test('no-op append keeps the subtotal dialog open with a clear notice', async () => {
  const { store } = await createFixture({
    inspect: async () => ({ ...sampleList, placement: 'below' }),
    change: async () => ({ changed: false, range: sampleList.range, edits: [], projection: null }),
  })
  render(<WorkbookStoreProvider store={store} plugins={[dataSubtotalPlugin]}>
    <PluginPanels />
  </WorkbookStoreProvider>)
  await act(async () => { await store.setter(configureSubtotalAtom, 'open') })
  expect(screen.getByRole('dialog', { name: 'Subtotal' })).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply subtotals' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('This subtotal calculation is already included.')
  expect(store.getter(subtotalPanelAtom)).not.toBeNull()
})
