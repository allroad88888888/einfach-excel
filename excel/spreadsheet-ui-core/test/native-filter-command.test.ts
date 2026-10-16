import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  runVisibleProjectionAtom,
  runNativeFilterAtom,
  nativeFilterFeedbackAtom,
  nativeFilterRulesAtom,
  projectionSnapshotAtom,
  setRustWorkbookConnectionAtom,
  setSheetProtectionAtom,
  configureNativeFilterAtom,
  nativeFilterPanelAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['sheet.filter']['payload']
const rules = [{ kind: 'equals' as const, colIndex: 2, value: 'West' }]
const result = (p: Input) => ({
  hiddenRows: 2,
  projection: {
    ...p.projection,
    cells: [],
    revision: 2,
    filterRules: p.action === 'clear' ? [] : rules,
    visibility: {
      manualRows: [],
      manualColumns: [],
      filterRows: p.action === 'clear' ? [] : [2, 4],
    },
  },
})
async function setup() {
  const filter = vi.fn(async (p: Input) => result(p))
  const request = vi.fn(async (cmd: string, p: unknown) =>
    cmd === 'sheet.filter'
      ? filter(p as Input)
      : {
          ...(p as { request: VisibleProjectionRequest }).request,
          cells: [],
          revision: 1,
          filterRules: [],
        },
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Orders', index: 0, rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 2 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  return { store, filter, request }
}

test.each(['apply', 'reapply', 'clear'] as const)(
  '%s makes one request and publishes native conditions',
  async (action) => {
    const { store, filter, request } = await setup()
    expect(await store.setter(runNativeFilterAtom, { action, rules })).toBe(true)
    expect(filter).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
    expect(store.getter(nativeFilterRulesAtom)).toEqual(action === 'clear' ? [] : rules)
  },
)

test('protection, pending command and disposed connection cannot write or publish twice', async () => {
  const { store, filter } = await setup()
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await store.setter(runNativeFilterAtom, { action: 'apply', rules })).toBe(false)
  expect(filter).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'open', unlockedRanges: [] },
  })
  let finish!: (r: ReturnType<typeof result>) => void
  filter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const before = store.getter(projectionSnapshotAtom)
  const pending = store.setter(runNativeFilterAtom, { action: 'apply', rules })
  expect(filter.mock.calls, JSON.stringify(store.getter(nativeFilterFeedbackAtom))).toHaveLength(1)
  expect(await store.setter(runNativeFilterAtom, { action: 'clear' })).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish(result(filter.mock.lastCall![0]))
  expect(await pending).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(nativeFilterFeedbackAtom).busy).toBe(false)
})

test('native rejection and invalid projection preserve the old result', async () => {
  const { store, filter } = await setup()
  const before = store.getter(projectionSnapshotAtom)
  filter.mockRejectedValueOnce(new Error('Too large'))
  expect(await store.setter(runNativeFilterAtom, { action: 'apply', rules })).toBe(false)
  expect(store.getter(nativeFilterFeedbackAtom).error).toBe('Too large')
  filter.mockImplementationOnce(async (p) => ({
    ...result(p),
    projection: { ...result(p).projection, sheetId: 'wrong' },
  }))
  expect(await store.setter(runNativeFilterAtom, { action: 'apply', rules })).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(await store.setter(runNativeFilterAtom, { action: 'apply', rules })).toBe(true)
  expect(filter).toHaveBeenCalledTimes(3)
  expect(store.getter(projectionSnapshotAtom)).not.toBe(before)
  expect(store.getter(nativeFilterFeedbackAtom)).toMatchObject({ busy: false, error: '' })
})

test('clear publishes when a viewport read started before it finishes first', async () => {
  const { store, filter, request } = await setup()
  await store.setter(runNativeFilterAtom, { action: 'apply', rules })
  let finishRead!: (value: Awaited<ReturnType<typeof request>>) => void
  let finishClear!: (value: ReturnType<typeof result>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve }))
  const refresh = store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    retainResult: true,
  })
  const readRequest = store.getter(projectionSnapshotAtom).request as VisibleProjectionRequest
  filter.mockImplementationOnce(() => new Promise((resolve) => { finishClear = resolve }))
  const clear = store.setter(runNativeFilterAtom, { action: 'clear' })
  // Worker 顺序执行：旧读取先返回，清除随后返回同一窗口的新投影。
  finishRead({ ...readRequest, cells: [], revision: 2, filterRules: rules })
  await refresh
  expect(store.getter(nativeFilterRulesAtom)).toEqual(rules)
  finishClear({ ...result(filter.mock.lastCall![0]), hiddenRows: 0 })
  expect(await clear).toBe(true)
  expect(store.getter(nativeFilterRulesAtom)).toEqual([])
  expect(request).toHaveBeenCalledTimes(4)
})

test.each(['scroll', 'same-window-refresh', 'sheet-round-trip'] as const)(
  'clear cannot replace a newer %s projection', async (scenario) => {
    const { store, filter } = await setup()
    let finishClear!: (value: ReturnType<typeof result>) => void
    filter.mockImplementationOnce(() => new Promise((resolve) => { finishClear = resolve }))
    const clear = store.setter(runNativeFilterAtom, { action: 'clear' })
    if (scenario === 'sheet-round-trip')
      await store.setter(runVisibleProjectionAtom, {
        sheetId: 'other', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
      })
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: scenario === 'scroll' ? 5 : 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
    const newer = store.getter(projectionSnapshotAtom)
    finishClear(result(filter.mock.lastCall![0]))
    await clear
    expect(store.getter(projectionSnapshotAtom)).toBe(newer)
  },
)

test('panel composes AND conditions, validates range, cancels without writing and reopens native rules', async () => {
  const { store, filter } = await setup()
  await store.setter(configureNativeFilterAtom, 'open')
  await store.setter(configureNativeFilterAtom, {
    type: 'change',
    index: 0,
    patch: { value: 'West' },
  })
  await store.setter(configureNativeFilterAtom, 'add')
  await store.setter(configureNativeFilterAtom, {
    type: 'change',
    index: 1,
    patch: { kind: 'range', min: '20', max: '10' },
  })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(filter).not.toHaveBeenCalled()
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 1, patch: { min: '5' } })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
  expect(filter.mock.lastCall![0]).toMatchObject({
    rules: [rules[0], { kind: 'range', colIndex: 0, min: 5, max: 10 }],
  })
  await store.setter(configureNativeFilterAtom, 'open')
  expect(store.getter(nativeFilterPanelAtom).conditions).toHaveLength(1)
  expect(store.getter(nativeFilterPanelAtom).conditions[0]?.value).toBe('West')
  await store.setter(configureNativeFilterAtom, 'close')
  expect(filter).toHaveBeenCalledTimes(1)
})
