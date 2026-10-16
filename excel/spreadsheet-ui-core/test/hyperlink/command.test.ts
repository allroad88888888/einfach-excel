import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setSelectionAtom, setRustWorkbookConnectionAtom, setSheetProtectionAtom,
  hyperlinkPanelAtom, runHyperlinkAtom, readCellHyperlinkAtom, projectionSnapshotAtom,
  type DisplayCell, type RustWorkbookCommands, type RustWorkbookConnection } from '../../src'

type Input = RustWorkbookCommands['hyperlink.change']['payload']
function setup(cells: DisplayCell[] = [{ row: 1, col: 1, displayValue: '3', formula: '=1+2' }]) {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: Input) => ({ changed: true,
    projection: { ...input.projection,
      cells: [{ ...cells[0], hyperlink: input.url ?? undefined }], revision: 2 } }))
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  const select = (row: number, col = 1) => store.setter(setSelectionAtom, { sheetId: 's',
    kind: 'range', anchor: { row, col }, focus: { row, col } })
  select(1)
  const project = (revision = 1) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started' || read.request.kind !== 'visible-window')
      throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells, revision } })
  }
  project()
  const run = (action: Parameters<typeof runHyperlinkAtom.write>[2]) =>
    store.setter(runHyperlinkAtom, action)
  return { store, request, run, project, select }
}

test('draft/cancel is UI state only; unchanged formula display never sends replacement text', async () => {
  const { store, request, run } = setup()
  expect(await run('open')).toBe(true)
  await run({ url: 'https://example.com' })
  expect(store.getter(hyperlinkPanelAtom)).toMatchObject({ text: '3', existing: false })
  await run('close')
  expect(request).not.toHaveBeenCalled()
  await run('open'); await run({ url: 'https://example.com' }); await run('save')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['hyperlink.change', {
    sheetId: 's', row: 1, col: 1, revision: 1, url: 'https://example.com',
  }])
  expect(request.mock.calls[0][1]).not.toHaveProperty('text')
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(2)
  expect(store.getter(hyperlinkPanelAtom).open).toBe(false)
  expect(store.setter(readCellHyperlinkAtom, { row: 1, col: 1 })).toBe('https://example.com')
})

test('changed display text is explicit, while blank cells default to the link address', async () => {
  const { request, run } = setup([])
  await run('open'); await run({ url: 'https://example.com' }); await run('save')
  expect(request.mock.calls[0][1].text).toBe('https://example.com')
  const populated = setup()
  await populated.run('open'); await populated.run({ url: 'https://example.com', text: '=literal' })
  await populated.run('save')
  expect(populated.request.mock.calls[0][1].text).toBe('=literal')
})

test('removal ignores all unsaved fields and never clears text', async () => {
  const { request, run } = setup([{ row: 1, col: 1, displayValue: 'Customer', hyperlink: 'https://example.com' }])
  await run('open'); await run({ url: '', text: 'discard' }); await run('remove')
  expect(request.mock.calls[0][1].url).toBeNull()
  expect(request.mock.calls[0][1]).not.toHaveProperty('text')
})

test('offscreen selection cannot interpret a missing projected cell as blank', async () => {
  const { store, run, select, request } = setup()
  select(90)
  expect(store.getter(hyperlinkPanelAtom).available).toBe(false)
  expect(await run('open')).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test('frozen cells use their native projected URL even outside the scrolling window', async () => {
  const { store, run, select } = setup()
  select(0, 0)
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'viewport', window: { rowStart: 10, rowEnd: 19, colStart: 2, colEnd: 7 } })
  if (read.status !== 'started' || read.request.kind !== 'visible-window')
    throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: { ...read.request,
    cells: [], revision: 1, freeze: { rows: 1, cols: 1 }, frozen: { height: 28, width: 120,
      regions: [{ pane: 'corner', window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        cells: [{ row: 0, col: 0, displayValue: 'Frozen', hyperlink: 'https://frozen.example/' }] }],
    } } })
  expect(await run('open')).toBe(true)
  expect(store.getter(hyperlinkPanelAtom)).toMatchObject({ url: 'https://frozen.example/', text: 'Frozen' })
  expect(store.setter(readCellHyperlinkAtom, { row: 0, col: 0 })).toBe('https://frozen.example/')
})

test('stale revision and protected cell reject a write, preserving draft for explicit retry', async () => {
  const { store, request, run, project } = setup()
  await run('open'); await run({ url: 'https://example.com' })
  project(3)
  expect(await run('save')).toBe(false)
  expect(store.getter(hyperlinkPanelAtom).error).toContain('Reopen')
  expect(request).not.toHaveBeenCalled()
  await run('close'); project(); await run('open')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('save')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'open', unlockedRanges: [] } })
  await run({ url: 'https://example.com' })
  request.mockRejectedValueOnce(new Error('Enter a valid http:// or https:// address.'))
  expect(await run('save')).toBe(false)
  expect(store.getter(hyperlinkPanelAtom)).toMatchObject({ open: true, busy: false, url: 'https://example.com' })
  expect(await run('save')).toBe(true)
})

test('pending submission prevents duplicate writes, and replaced workbook ignores late replies', async () => {
  const { store, request, run } = setup()
  let finish!: (reply: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await run('open'); await run({ url: 'https://example.com' })
  const pending = run('save')
  expect(store.getter(hyperlinkPanelAtom).busy).toBe(true)
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, { request: vi.fn() as RustWorkbookConnection['request'], dispose() {} })
  const input = request.mock.calls[0][1]
  finish({ changed: true, projection: { ...input.projection, cells: [], revision: 2 } })
  expect(await pending).toBe(false)
  expect(store.getter(hyperlinkPanelAtom)).toMatchObject({ open: false, busy: false })
  expect(request).toHaveBeenCalledTimes(1)
})

test('wrong acknowledgement revision cannot publish its projection', async () => {
  const { store, request, run } = setup()
  request.mockImplementationOnce(async (_command, input) => ({ changed: true,
    projection: { ...input.projection, cells: [], revision: 99 } }))
  await run('open'); await run({ url: 'https://example.com' })
  expect(await run('save')).toBe(false)
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
  expect(store.getter(hyperlinkPanelAtom).error).toContain('mismatched')
})
