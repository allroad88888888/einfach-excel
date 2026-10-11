import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, setRustWorkbookConnectionAtom, beginProjectionAtom,
  resolveProjectionAtom, runNativeTablePanelAtom, nativeTablePanelAtom, setSheetProtectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type NativeTable } from '../src'

type Input = RustWorkbookCommands['table.change']['payload']
const tables = [{ name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4',
  hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount'] }]
function setup(catalog: NativeTable[] = tables) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const request = vi.fn(async (_: string, input: Input) => ({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2, tables: [] as NativeTable[] } }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, revision: 1, cells: [], tables: catalog } })
  return { store, request, run: (action: Parameters<typeof runNativeTablePanelAtom.write>[2]) =>
    store.setter(runNativeTablePanelAtom, action) }
}

test('column rename uses the native identity and reselects the returned column, including totals', async () => {
  const { store, request, run } = setup()
  request.mockImplementationOnce(async (_, input) => ({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2,
      tables: [{ ...tables[0], columns: ['Product', 'Net'], hasTotals: true, totalFunctions: ['none', 'sum'] }] } }))
  await run('open'); await run({ edit: 'Sales' }); await run({ column: 'Amount' })
  await run({ name: 'Unsaved', newColumnName: ' Net ' })
  expect(await run('save-column')).toBe(true)
  expect(request.mock.calls[0][1].action).toEqual({ kind: 'rename-column', name: 'Sales',
    column: 'Amount', newName: ' Net ' })
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true, name: 'Unsaved',
    column: 'Net', newColumnName: 'Net', totalColumn: 'Net', totalFunction: 'sum', revision: 2 })
  expect(request).toHaveBeenCalledTimes(1)
})

test('blank and conflicting column names keep the old catalog and editable draft', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ edit: 'Sales' }); await run({ column: 'Amount' })
  expect(store.getter(nativeTablePanelAtom).newColumnName).toBe('Amount')
  await run({ newColumnName: ' ' }); expect(await run('save-column')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  await run({ newColumnName: 'Product' })
  request.mockRejectedValueOnce(new Error('Duplicate column name'))
  expect(await run('save-column')).toBe(false)
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true,
    newColumnName: 'Product', error: 'Duplicate column name', tables })
})
test('resize retains column identity after adding columns to the left and reads the returned range', async () => {
  const { store, request, run } = setup()
  request.mockImplementationOnce(async (_, input) => ({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2,
      tables: [{ ...tables[0], range: 'A1:C6', columns: ['New', 'Product', 'Amount'] }] } }))
  await run('open'); await run({ edit: 'Sales' }); await run({ column: 'Amount' })
  await run({ name: 'Unsaved', range: 'A1:C6' }); expect(await run('resize')).toBe(true)
  expect(request.mock.calls[0][1].action).toEqual({ kind: 'resize', name: 'Sales',
    range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 2 } })
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true, name: 'Unsaved',
    range: 'A1:C6', column: 'Amount', newColumnName: 'Amount', revision: 2 })
  await run({ range: 'A101:B102' }); expect(await run('resize')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})
test('new table draft uses coordinates, blank name lets Rust choose, no optimistic registry', async () => {
  const { store, request, run } = setup([])
  await run('open'); await run({ range: 'A1:B4' }); await run('save')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['table.change', { action: {
    kind: 'create', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 },
  }, revision: 1 }])
  expect(store.getter(nativeTablePanelAtom).open).toBe(false)
  expect(store.getter(nativeTablePanelAtom).tables).toEqual([])
})

test('totals actions retain the panel and derive each new draft from the returned projection', async () => {
  const { store, request, run } = setup()
  const updated: NativeTable = { ...tables[0], range: 'A1:B5', hasTotals: true,
    totalFunctions: ['none', 'sum'] }
  request.mockImplementation(async (_, input) => ({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2, tables: [updated] } }))
  await run('open'); await run({ edit: 'Sales' }); await run({ name: 'UnsavedName' })
  await run('show-totals')
  expect(request.mock.calls[0][1].action).toEqual({ kind: 'totals-row', name: 'Sales', enabled: true })
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true, name: 'UnsavedName',
    range: 'A1:B5', totalColumn: 'Amount', totalFunction: 'sum' })
  await run({ totalColumn: 'Product' })
  expect(store.getter(nativeTablePanelAtom).totalFunction).toBe('none')
  await run({ totalFunction: 'count' }); await run('save-total')
  expect(request.mock.calls[1][1]).toMatchObject({ revision: 2,
    action: { kind: 'total-function', name: 'Sales', column: 'Product', function: 'count' } })
  // 回包仍是 none；UI 不把草稿 count 当作已保存的事实。
  expect(store.getter(nativeTablePanelAtom).totalFunction).toBe('none')
  await run('hide-totals')
  expect(request.mock.calls[2][1].action).toEqual({ kind: 'totals-row', name: 'Sales', enabled: false })
})

test('custom total content is explicit and cannot be submitted as a native function', async () => {
  const { store, request, run } = setup([{ ...tables[0], hasTotals: true, totalFunctions: ['none', null] }])
  await run('open'); await run({ edit: 'Sales' })
  expect(store.getter(nativeTablePanelAtom).totalFunction).toBe('custom')
  expect(await run('save-total')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  request.mockRejectedValueOnce(new Error('Totals row blocked'))
  expect(await run('hide-totals')).toBe(false)
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true, error: 'Totals row blocked' })
})
test.each(['save', 'convert'] as const)('%s uses original table identity, not draft identity', async (action) => {
  const { request, run } = setup()
  await run('open'); await run({ edit: 'Sales' }); await run({ name: 'Revenue' }); await run(action)
  expect(request.mock.calls[0][1].action).toEqual(action === 'save'
    ? { kind: 'rename', name: 'Sales', newName: 'Revenue' }
    : { kind: 'convert-to-range', name: 'Sales' })
})
test('native errors retain draft and local invalid ranges do not send a request', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ range: 'A101:B102' }); expect(await run('save')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  await run({ range: 'A1:B4', name: 'Sales' })
  request.mockRejectedValueOnce(new Error('Overlap'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: true, name: 'Sales', error: 'Overlap' })
})
test('pending command blocks double submit, and replacement workbook ignores the old result', async () => {
  const { store, request, run } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await run('open'); await run({ edit: 'Sales' })
  const pending = run('convert')
  await Promise.resolve()
  expect(store.getter(nativeTablePanelAtom).busy).toBe(true)
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  const payload = request.mock.calls[0][1]
  store.setter(setRustWorkbookConnectionAtom, {
    request: vi.fn() as RustWorkbookConnection['request'], dispose() {},
  })
  finish({ changed: true,
    projection: { ...payload.projection, cells: [], revision: 2, tables: [] } })
  expect(await pending).toBe(false)
  expect(store.getter(nativeTablePanelAtom)).toMatchObject({ open: false, busy: false })
})
test('protected workbook and stale draft are rejected before dispatch', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ edit: 'Sales' })
  store.setter(setSheetProtectionAtom, {
    sheetId: 's', state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await run('convert')).toBe(false)
  expect(store.getter(nativeTablePanelAtom).error).toContain('Unprotect')
  store.setter(setSheetProtectionAtom, {
    sheetId: 's', state: { mode: 'open', unlockedRanges: [] },
  })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, revision: 2, cells: [], tables } })
  expect(await run('convert')).toBe(false)
  expect(store.getter(nativeTablePanelAtom).error).toContain('Reopen')
  expect(request).not.toHaveBeenCalled()
})
