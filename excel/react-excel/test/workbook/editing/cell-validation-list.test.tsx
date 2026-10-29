import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  setViewportMetricsAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { CellValidationList } from '../../../src/workbook/grid/editor/CellValidationList'

async function setup(frozen = false) {
  const store = createStore()
  const bubble = vi.fn()
  const request = vi.fn(async (cmd: string, payload: unknown) => {
    if (cmd === 'validation.read') return { kind: 'list', items: ['001', '=1+2'], ignoreBlank: true }
    if (cmd === 'cell.setInput') {
      const p = payload as RustWorkbookCommands['cell.setInput']['payload']
      return { acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 2 },
        projection: { ...p.projection, cells: [], revision: 2 } }
    }
    const p = payload as { request: VisibleProjectionRequest }
    return { ...p.request, cells: [], revision: 1,
      ...(frozen ? { freeze: { rows: 2, cols: 1 },
        frozen: { height: 56, width: 120, regions: [] } } : {}) }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const metrics = { sheetId: 's', rowCount: 100, colCount: 8, rowHeight: 28, colWidth: 120,
    viewportWidth: 600, viewportHeight: 400, scrollTop: 0, scrollLeft: 0,
    overscanRows: 2, overscanCols: 2 }
  store.setter(setViewportMetricsAtom, metrics)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><div onPointerDown={bubble} onDoubleClick={bubble} onKeyDown={bubble}>
    <CellValidationList focusGrid={vi.fn()} />
  </div></WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 15, colStart: 0, colEnd: 7 },
    })
  })
  return { store, request, bubble, metrics }
}

test('native options keep literal content and grid does not receive select events', async () => {
  const { request, bubble } = await setup()
  const list = screen.getByRole('combobox', { name: 'Choose cell value' })
  expect(screen.getByRole('option', { name: '001' })).toHaveValue('0')
  expect(screen.getByRole('option', { name: '=1+2' })).toHaveValue('1')
  fireEvent.pointerDown(list); fireEvent.doubleClick(list); fireEvent.keyDown(list, { key: 'ArrowDown' })
  expect(bubble).not.toHaveBeenCalled()
  await act(async () => { fireEvent.change(list, { target: { value: '1' } }) })
  expect(request.mock.calls.filter(([cmd]) => cmd === 'cell.setInput')).toMatchObject([
    ['cell.setInput', { request: { row: 1, col: 0, input: "'=1+2" } }],
  ])
})

test('scroll only repositions/clips the list, not another rule request', async () => {
  const { store, request, metrics } = await setup()
  const reads = () => request.mock.calls.filter(([cmd]) => cmd === 'validation.read').length
  const initial = reads()
  expect(screen.getByRole('combobox')).toHaveStyle({ top: '56px', left: '144px' })
  await act(async () => { store.setter(setViewportMetricsAtom, { ...metrics, scrollTop: 100 }) })
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(reads()).toBe(initial)
  await act(async () => { store.setter(setViewportMetricsAtom, metrics) })
  expect(screen.getByRole('combobox')).toBeVisible()
  expect(reads()).toBe(initial)
})

test('a frozen cell keeps its dropdown in the frozen pane while scrolling', async () => {
  const { store, metrics } = await setup(true)
  await act(async () => {
    store.setter(setViewportMetricsAtom, { ...metrics, scrollTop: 100, scrollLeft: 120 })
  })
  expect(screen.getByRole('combobox')).toHaveStyle({ top: '156px', left: '264px' })
})
