import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
const projection = { kind: 'visible-window', sheetId: 's', window: range, requestId: 1 }
const input = {
  action: 'set',
  sheetId: 's',
  revision: 0,
  priority: -1,
  scope: { range },
  rule: { kind: 'cell-value', operator: 'gt', value: '2', format: { bgColor: '#ffc7ce' } },
  projection,
}
async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback
    },
    postMessage: post,
  })
  const config = {
    revision: 1,
    rules: [{ id: 'r', scope: input.scope, priority: -1, rule: input.rule }],
  }
  const write = vi.fn(() => config)
  const remove = vi.fn(() => config)
  const manage = vi.fn(() => config)
  const base = vi.fn(() => ({ cellStyles: [], rowStyles: [], columnStyles: [] }))
  const display = vi.fn(() => ({
    ...base(),
    cellStyles: [{ addr: 'A2', format: { bgColor: '#ffc7ce' } }],
  }))
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name() {
      return 'Sheet'
    }

    setConditionalFormatRule = write
    removeConditionalFormatRule = remove
    manageConditionalFormatRule = manage
    listConditionalFormats = () => config
    history_state = () => ({ undoCount: 1, redoCount: 0 })
    snapshot_format_range = base
    snapshot_display_format_range = display
    read_sparse_range = () => []
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  return { call, write, remove, manage, display }
}

test('set delegates once and returns native display, rules and history in one projection', async () => {
  const { call, write, display } = await setup()
  const response = await call('conditionalFormat.change', input)
  expect(response).toMatchObject({
    ok: true,
    result: {
      projection: {
        revision: 1,
        conditionalFormats: { revision: 1 },
        history: { undoCount: 1 },
        cells: [{ row: 1, col: 0, format: { bgColor: '#ffc7ce' } }],
      },
    },
  })
  expect(write).toHaveBeenCalledWith(0, {
    revision: 0,
    ruleId: undefined,
    scope: { range },
    priority: -1,
    rule: input.rule,
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(display).toHaveBeenCalledWith(0, 1, 0, 3, 0)
})

test('remove uses the same projection command without cell writes', async () => {
  const { call, write, remove } = await setup()
  expect(
    (
      await call('conditionalFormat.change', {
        action: 'remove',
        sheetId: 's',
        revision: 1,
        ruleId: 'r',
        projection,
      })
    ).ok,
  ).toBe(true)
  expect(remove).toHaveBeenCalledWith(0, { revision: 1, ruleId: 'r' })
  expect(write).not.toHaveBeenCalled()
})

test('invalid targets reject before Rust and native failures cannot advance the data revision', async () => {
  const { call, write } = await setup()
  for (const patch of [
    { sheetId: 'missing' },
    { revision: -1 },
    { projection: { ...projection, sheetId: 'other' } },
    { scope: { range: { ...range, rowEnd: 100 } } },
  ]) {
    expect((await call('conditionalFormat.change', { ...input, ...patch })).ok).toBe(false)
  }
  expect(write).not.toHaveBeenCalled()
  write.mockImplementationOnce(() => {
    throw new Error('stale-conditional-format-revision')
  })
  expect((await call('conditionalFormat.change', input)).error.message).toMatch(/stale/)
  expect((await call('conditionalFormat.change', input)).result.projection.revision).toBe(1)
})

test.each(['duplicate', 'enable', 'disable', 'move-up', 'move-down'])(
  '%s delegates one atomic native management action and returns its display projection', async (action) => {
    const { call, write, remove, manage, display } = await setup()
    const response = await call('conditionalFormat.change', {
      action, sheetId: 's', revision: 1, ruleId: 'r', projection,
    })
    expect(response).toMatchObject({
      ok: true, result: { projection: { history: { undoCount: 1 } } },
    })
    expect(manage).toHaveBeenCalledTimes(1)
    expect(manage).toHaveBeenCalledWith(0, { action, revision: 1, ruleId: 'r' })
    expect(write).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(display).toHaveBeenCalled()
  },
)
