import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, startEditingAtom,
  type RustWorkbookConnection } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookPresentationProvider } from '../../src/page/WorkbookPresentationProvider'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { WorkbookHeader } from '../../src/workbook/chrome/header/WorkbookHeader'
import {
  convertNativeToXlsx,
  convertXlsxToNative,
  type XlsxConverter,
} from '../../src/workbook/xlsx/xlsx-converter'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 10, colCount: 4 },
  ] })
  const request = vi.fn(async () => ({ text: '{"native":true}', filename: 'Book.einfach.json' }))
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><WorkbookHeader /></WorkbookStoreProvider>)
  return { store, request }
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test.each([false, true])('Tab shift=%s cycles inside the file dialog without Rust writes', async (shiftKey) => {
  const { request } = setup()
  await click('File')
  const first = screen.getByRole('button', { name: 'Download workbook' })
  const last = screen.getByRole('button', { name: 'Close' })
  const origin = shiftKey ? first : last
  origin.focus()
  expect(fireEvent.keyDown(origin, { key: 'Tab', shiftKey })).toBe(false)
  expect(shiftKey ? last : first).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('header tells the truth about in-memory state; File opens and closes with focus restoration', async () => {
  setup()
  expect(screen.queryByText('Saved locally')).toBeNull()
  expect(screen.getByText('In memory')).toBeVisible()
  await click('File')
  expect(screen.getByRole('dialog', { name: 'Workbook files' })).toBeVisible()
  await click('Close')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'File' })).toHaveFocus()
})

test('download uses one command and a real DOM download target', async () => {
  vi.useFakeTimers()
  const { request } = setup()
  const create = vi.fn(() => 'blob:workbook'), revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('Book.einfach.json')
    expect(this.href).toBe('blob:workbook')
  })
  await click('File'); await click('Download workbook')
  expect(request).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledWith('workbook.exportFile', { title: 'Book' })
  expect(create).toHaveBeenCalledOnce()
  expect(clickAnchor).toHaveBeenCalledOnce()
  expect(screen.getByRole('status')).toHaveTextContent('Download requested')
  await vi.runAllTimersAsync()
  expect(revoke).toHaveBeenCalledWith('blob:workbook')
})

test('download failures remain in the dialog and permit retry', async () => {
  const { request } = setup()
  request.mockRejectedValueOnce(new Error('Snapshot unavailable'))
  await click('File'); await click('Download workbook')
  expect(screen.getByRole('alert')).toHaveTextContent('Snapshot unavailable')
  expect(screen.getByRole('button', { name: 'Download workbook' })).toBeEnabled()
})

test('declining New and Open neither reads a file nor requests Rust', async () => {
  const { request } = setup()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('File'); await click('New blank workbook')
  const read = vi.fn(async () => '{}')
  await act(async () => {
 fireEvent.change(screen.getByLabelText('Open workbook'), {
    target: { files: [{ name: 'Book.einfach.json', size: 2, text: read }] },
  })
})
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(request).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
})

test('file read error keeps the current book and allows selecting the same file again', async () => {
  const { request } = setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const read = vi.fn(async () => { throw new Error('Cannot read file') })
  await click('File')
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => {
 fireEvent.change(screen.getByLabelText('Open workbook'), {
      target: { files: [{ name: 'Book.einfach.json', size: 2, text: read }] },
    })
})
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read file')
  }
  expect(read).toHaveBeenCalledTimes(2)
  expect(request).not.toHaveBeenCalled()
  expect(screen.getByText('Book')).toBeVisible()
})

test('File stays disabled while a cell draft is being edited', () => {
  const { store } = setup()
  act(() => {
 store.setter(startEditingAtom, {
    sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: 'Keep draft',
  })
})
  expect(screen.getByRole('button', { name: 'File' })).toBeDisabled()
})

test('convertXlsxToNative and convertNativeToXlsx support both report-enabled and legacy converters', () => {
  const legacy: XlsxConverter = {
    xlsxToNative: () => '{"legacy":true}',
    nativeToXlsx: () => new Uint8Array([1, 2]),
  }
  expect(convertXlsxToNative(legacy, new Uint8Array([9]), 'Book')).toEqual({
    text: '{"legacy":true}',
    report: { items: [], summary: '' },
    message: '',
  })
  expect(convertNativeToXlsx(legacy, '{}')).toEqual({
    bytes: new Uint8Array([1, 2]),
    report: { items: [], summary: '' },
    message: '',
  })

  const modern: XlsxConverter = {
    ...legacy,
    xlsxToNativeWithReport: () => ({
      text: '{"modern":true}',
      report: JSON.stringify({
        items: [{ kind: 'charts', count: 1 }],
        summary: 'Opened Excel workbook. Skipped: charts.',
      }),
    }),
    nativeToXlsxWithReport: () => ({
      bytes: new Uint8Array([3, 4]),
      report: JSON.stringify({
        items: [{ kind: 'sheetProtection', count: 1 }],
        summary: 'Download requested. Not exported to Excel: sheet protection.',
      }),
    }),
  }
  expect(convertXlsxToNative(modern, new Uint8Array([9]), 'Book')).toEqual({
    text: '{"modern":true}',
    report: {
      items: [{ kind: 'charts', count: 1 }],
      summary: 'Opened Excel workbook. Skipped: charts.',
    },
    message: 'Opened Excel workbook. Skipped: charts.',
  })
  expect(convertNativeToXlsx(modern, '{}')).toEqual({
    bytes: new Uint8Array([3, 4]),
    report: {
      items: [{ kind: 'sheetProtection', count: 1 }],
      summary: 'Download requested. Not exported to Excel: sheet protection.',
    },
    message: 'Download requested. Not exported to Excel: sheet protection.',
  })
})

test('Download as Excel (.xlsx) displays the export conversion report summary', async () => {
  vi.useFakeTimers()
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 10, colCount: 4 }],
  })
  const request = vi.fn(async () => ({ text: '{"native":true}', filename: 'Book.einfach.json' }))
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:xlsx', revokeObjectURL: () => {} })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const xlsx = async (): Promise<XlsxConverter> => ({
    xlsxToNative: () => '{}',
    nativeToXlsx: () => new Uint8Array([1]),
    nativeToXlsxWithReport: () => ({
      bytes: new Uint8Array([1, 2, 3]),
      report: JSON.stringify({
        items: [{ kind: 'sheetProtection', count: 1 }],
        summary: 'Download requested. Not exported to Excel: sheet protection.',
      }),
    }),
  })
  render(
    <WorkbookStoreProvider
      store={store}
      connection={{ request: request as RustWorkbookConnection['request'], dispose() {} }}
    >
      <WorkbookPresentationProvider xlsx={xlsx}>
        <WorkbookHeader />
      </WorkbookPresentationProvider>
    </WorkbookStoreProvider>,
  )
  await click('File')
  await click('Download as Excel (.xlsx)')
  expect(screen.getByRole('status')).toHaveTextContent(
    'Download requested. Not exported to Excel: sheet protection.',
  )
  await vi.runAllTimersAsync()
})
