import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, numberFormatPanelAtom, runNumberFormatPanelAtom,
  runVisibleProjectionAtom, selectCellAtom, type SpreadsheetNumberFormat,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'
import { nextNumberFormat } from '../src/toolbar/number-format-action'

async function setup(format: SpreadsheetNumberFormat = { kind: 'general' }) {
  const preview = vi.fn(async (_request: unknown) => ({ text: 'native witness' }))
  const write = vi.fn()
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    previewNumberFormat: preview,
    setRangeFormat: async (request, projection) => {
      write(request)
      return { acknowledgement: { sheetId: request.sheetId,
        requestId: request.requestId, revision: 2 },
        projection: { kind: 'visible-window', sheetId: projection.sheetId, requestId: projection.requestId,
          revision: 2, window: projection.window, cells: [] } }
    },
    readVisibleProjection: async request => ({ kind: 'visible-window', sheetId: request.sheetId,
      requestId: request.requestId, revision: 1, window: request.window,
      cells: [{ row: 0, col: 0, displayValue: '123', numericValue: 123, format: { numberFormat: format } }] }),
  }) })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's',
    window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }, reason: 'viewport' })
  await store.setter(runNumberFormatPanelAtom, 'open')
  return { store, write, preview }
}

test('a locale change switches its draft preset atomically and sends only one canonical format', async () => {
  const { store, write, preview } = await setup({ kind: 'special', preset: 'ssn-us', locale: 'en-US' })
  expect(store.getter(numberFormatPanelAtom).draft).toMatchObject({
    category: 'special', specialPreset: 'ssn-us', specialLocale: 'en-US',
  })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { specialLocale: 'zh-CN' } })
  expect(store.getter(numberFormatPanelAtom).draft).toMatchObject({
    specialPreset: 'postal-code-cn', specialLocale: 'zh-CN',
  })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: 'native witness' })
  expect(write).not.toHaveBeenCalled()
  expect(preview.mock.calls.at(-1)?.[0]).toMatchObject({
    numberFormat: { kind: 'special', preset: 'postal-code-cn', locale: 'zh-CN' },
  })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0][0].format).toEqual({
    numberFormat: { kind: 'special', preset: 'postal-code-cn', locale: 'zh-CN' },
  })
})

test.each([
  { specialPreset: 'missing', specialLocale: 'en-US' },
  { specialPreset: 'zip-code', specialLocale: 'zh-CN' },
  { specialPreset: 'postal-code-cn', specialLocale: 'en-US' },
  { specialPreset: 'phone-us', specialLocale: 'en-GB' },
])('invalid preset/region %j never reaches the mutation', async patch => {
  const { store, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'special', ...patch } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('missing locale is inferred and precision shortcuts leave Special unchanged', async () => {
  const format = { kind: 'special', preset: 'postal-code-cn' } as const
  const { store } = await setup(format)
  expect(store.getter(numberFormatPanelAtom).draft.specialLocale).toBe('zh-CN')
  expect(nextNumberFormat(format, 'increase-decimal', 123)).toBeNull()
  expect(nextNumberFormat(format, 'decrease-decimal', 123)).toBeNull()
})
