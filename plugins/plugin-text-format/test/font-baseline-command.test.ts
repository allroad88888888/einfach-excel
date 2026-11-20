import { expect, test } from 'vitest'
import {
  createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom, setRustWorkbookConnectionAtom,
  type SpreadsheetCellFormat, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { fontBaselineFeedbackAtom, runFontBaselineAtom } from '../src/core'
import { createTestRustWorkbookConnection } from '../../../excel/spreadsheet-ui-core/test/support/rust-workbook-connection'

async function setup() {
  let format: SpreadsheetCellFormat = { fontSize: 24, bold: true }
  let revision = 1
  let fail = false
  let release: (() => void) | undefined
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({
    ...request, revision,
    cells: [{ row: 0, col: 0, displayValue: '12.5', numericValue: 12.5,
      valueKind: 'number' as const, formula: '=25/2', format }],
  })
  const connection = createTestRustWorkbookConnection({
    async readVisibleProjection(request) { return projection(request) },
    async setRangeFormat(request, projected) {
      writes.push(request)
      if (fail) throw new Error('native rejected')
      if (release) await new Promise<void>(resolve => { release = resolve })
      format = { ...format, ...request.format }
      revision++
      return { acknowledgement: { sheetId: request.sheetId, requestId: request.requestId,
        revision, affectedRange: request.range }, projection: projection(projected) }
    },
  })
  const core = createSpreadsheetUi({ connection })
  core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, { sheetId: 'sheet-1',
    window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }, reason: 'viewport' })
  return { store: core.store, connection, writes, fail: (value: boolean) => { fail = value },
    hold: () => { release = () => {} }, release: () => release?.() }
}

test('plugin sends one native patch per toggle and leaves values and nominal font size intact', async () => {
  const { store, writes } = await setup()
  for (const value of ['superscript', 'subscript', 'subscript'] as const)
    expect(await store.setter(runFontBaselineAtom, value)).toBe(true)
  expect(writes.map(write => write.format)).toEqual([
    { fontBaseline: 'superscript' }, { fontBaseline: 'subscript' }, { fontBaseline: 'normal' },
  ])
  expect(writes.every(write => write.writeMode === 'patch' && write.targets?.length === 1)).toBe(true)
})

test('pending rejects duplicate actions and a native failure remains dismissible and retryable', async () => {
  const state = await setup()
  state.fail(true)
  await expect(state.store.setter(runFontBaselineAtom, 'superscript')).resolves.toBe(false)
  expect(state.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: 'unconfirmed' })
  await expect(state.store.setter(runFontBaselineAtom, 'dismiss')).resolves.toBe(true)
  expect(state.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
  state.fail(false)
  state.hold()
  const pending = state.store.setter(runFontBaselineAtom, 'superscript')
  expect(state.store.getter(fontBaselineFeedbackAtom).busy).toBe(true)
  await expect(state.store.setter(runFontBaselineAtom, 'subscript')).resolves.toBe(false)
  state.release()
  await expect(pending).resolves.toBe(true)
  expect(state.writes).toHaveLength(2)
  expect(state.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
})

test('plugin feedback stays isolated across workbooks and does not survive a new connection', async () => {
  const first = await setup(), second = await setup()
  first.fail(true)
  await first.store.setter(runFontBaselineAtom, 'subscript')
  expect(first.store.getter(fontBaselineFeedbackAtom).error).toBe('unconfirmed')
  expect(second.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
  first.store.setter(setRustWorkbookConnectionAtom, second.connection)
  expect(first.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
})

test('an old in-flight action cannot publish feedback into a replacement workbook', async () => {
  const first = await setup(), second = await setup()
  first.hold()
  const pending = first.store.setter(runFontBaselineAtom, 'superscript')
  expect(first.store.getter(fontBaselineFeedbackAtom).busy).toBe(true)
  first.store.setter(setRustWorkbookConnectionAtom, second.connection)
  expect(first.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
  first.release()
  await expect(pending).resolves.toBe(false)
  expect(first.store.getter(fontBaselineFeedbackAtom)).toEqual({ busy: false, error: null })
  expect(second.writes).toHaveLength(0)
})
