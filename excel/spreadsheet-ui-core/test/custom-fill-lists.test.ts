import { expect, test, vi } from 'vitest'
import { configureFillSeriesAtom as run, createSpreadsheetUi, fillSeriesPanelAtom as panel,
  runVisibleProjectionAtom, selectCellAtom, type RustWorkbookCommands,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '../src'
import { resetWorkbookViewAtom } from '../src/runtime/reset-workbook-view'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input) => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
  projection: { ...p.projection, cells: [], revision: 1 },
  sizes: { rowHeights: [], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const { store } = createSpreadsheetUi({ connection: {
    request: (async (command: string, p: unknown) => command === 'range.fill' ? fill(p as Input)
      : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
    ) as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 54, col: 4 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 58, col: 4 }, extend: true })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', reason: 'viewport', window: { rowStart: 50, rowEnd: 60, colStart: 0, colEnd: 7 },
  })
  await store.setter(run, 'open')
  await store.setter(run, { field: 'kind', value: 'custom-list' })
  const save = async (name = 'Priority', text = ' Low \r\nMedium\nHigh\n') => {
    await store.setter(run, { field: 'listName', value: name })
    await store.setter(run, { field: 'listText', value: text })
    return store.setter(run, 'save-list')
  }
  return { store, fill, save }
}

test('save and reuse a trimmed preset without a native write; apply sends one existing fill', async () => {
  const { store, fill, save } = await setup()
  expect(await save(' Priority ')).toBe(true)
  expect(store.getter(panel)).toMatchObject({ selectedList: 0, listName: 'Priority',
    lists: [{ name: 'Priority', text: 'Low\nMedium\nHigh' }], notice: 'List saved.' })
  expect(fill).not.toHaveBeenCalled()
  await store.setter(run, 'close')
  await store.setter(run, 'open')
  await store.setter(run, { field: 'kind', value: 'custom-list' })
  expect(store.getter(panel).listText).toBe('Low\nMedium\nHigh')
  expect(await store.setter(run, 'apply')).toBe(true)
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.lastCall![0].request.series).toEqual({ kind: 'custom-list', sourceCount: 1,
    customValues: ['Low', 'Medium', 'High'] })
})

test('edit replaces only the selected preset, rename and deletion never write cells', async () => {
  const { store, fill, save } = await setup()
  await save()
  await store.setter(run, 'new-list')
  await save('Status', 'Open\nClosed')
  await store.setter(run, { field: 'selectedList', value: '0' })
  await save('Urgency', 'Low\nHigh')
  expect(store.getter(panel).lists).toEqual([
    { name: 'Urgency', text: 'Low\nHigh' }, { name: 'Status', text: 'Open\nClosed' },
  ])
  expect(await store.setter(run, 'delete-list')).toBe(true)
  expect(store.getter(panel)).toMatchObject({ selectedList: null, listName: '', listText: '',
    lists: [{ name: 'Status', text: 'Open\nClosed' }], notice: 'List deleted.' })
  await store.setter(run, { field: 'selectedList', value: '0' })
  expect(store.getter(panel).listText).toBe('Open\nClosed')
  expect(fill).not.toHaveBeenCalled()
})

test.each([
  ['', 'Low\nHigh', 'name'], ['x'.repeat(65), 'Low\nHigh', 'name'],
  ['Priority', 'Low', '2–512'], ['Priority', 'Low\n\nHigh', 'non-empty'],
  ['Priority', 'Low\nlow', 'unique'], ['Priority', 'x'.repeat(16_385), '16384'],
])('invalid preset %s is retryable and preserves saved entries', async (name, text, error) => {
  const { store, fill, save } = await setup()
  await save()
  const previous = store.getter(panel).lists
  expect(await save(name, text)).toBe(false)
  expect(store.getter(panel).lists).toBe(previous)
  expect(store.getter(panel).error).toContain(error)
  expect(await save()).toBe(true)
  expect(fill).not.toHaveBeenCalled()
})

test('duplicate names reject case-insensitively, while unsaved edits never mutate a preset', async () => {
  const { store, save } = await setup()
  await save()
  await store.setter(run, { field: 'listText', value: 'Low\nCritical' })
  expect(store.getter(panel).lists[0]!.text).toBe('Low\nMedium\nHigh')
  await store.setter(run, 'new-list')
  expect(await save('priority')).toBe(false)
  expect(store.getter(panel).error).toContain('already exists')
  await store.setter(run, { field: 'selectedList', value: '0' })
  expect(store.getter(panel).listText).toBe('Low\nMedium\nHigh')
  expect(await store.setter(run, { field: 'selectedList', value: '99' })).toBe(false)
})

test('presets are store-local, survive changing sheets and reset with the workbook', async () => {
  const { store, save } = await setup()
  await save()
  store.setter(selectCellAtom, { sheetId: 'other', coord: { row: 0, col: 0 } })
  expect(store.getter(panel).lists).toHaveLength(1)
  const other = await setup()
  expect(other.store.getter(panel).lists).toEqual([])
  store.setter(resetWorkbookViewAtom)
  expect(store.getter(panel)).toMatchObject({ target: null, lists: [], listText: '', listName: '' })
})

test('reset during a pending fill cannot resurrect presets from the old workbook', async () => {
  const { store, save, fill } = await setup()
  await save()
  let finish!: (value: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = store.setter(run, 'apply')
  for (const action of ['new-list', 'save-list', 'delete-list'] as const)
    expect(await store.setter(run, action)).toBe(false)
  store.setter(resetWorkbookViewAtom)
  finish(result(fill.mock.lastCall![0]))
  await pending
  expect(store.getter(panel)).toMatchObject({ target: null, lists: [], listName: '', listText: '' })
})

test('32 saved presets and 512 items are accepted, overflow rejects without partial changes', async () => {
  const { store, save } = await setup()
  for (let i = 0; i < 32; i++) {
    await store.setter(run, 'new-list')
    expect(await save(`List ${i}`)).toBe(true)
  }
  await store.setter(run, 'new-list')
  expect(await save('Overflow')).toBe(false)
  expect(store.getter(panel).error).toContain('32 custom lists')
  await store.setter(run, { field: 'selectedList', value: '0' })
  const values = Array.from({ length: 512 }, (_, i) => `item ${i}`).join('\n')
  expect(await save('Boundary', values)).toBe(true)
  expect(await save('Boundary', `${values}\nOverflow`)).toBe(false)
  expect(store.getter(panel).lists[0]!.text.split('\n')).toHaveLength(512)
})
