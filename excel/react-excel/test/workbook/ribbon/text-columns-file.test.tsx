import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  runVisibleProjectionAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  type RustClipboardPasteRequest,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { TextColumnsTools } from '../../../src/workbook/chrome/ribbon/TextColumnsTools'

function makeFile(name: string, content: string, type = 'text/plain'): File {
  const file = new File([content], name, { type })
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', { value: async () => content })
  }
  return file
}

async function setupFileDialog() {
  const pasteCalls: RustClipboardPasteRequest[] = []
  const connection: RustWorkbookConnection = {
    dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'textColumns.preview') {
        return {
          sourceColumnCount: 1,
          target: { rowStart: 1, colStart: 2, rowEnd: 1, colEnd: 2 },
          overwrittenCells: 0,
          sample: [['']],
          sampleTruncated: false,
          revision: 3,
        }
      }
      if (command === 'clipboard.paste') {
        const payload = input as {
          request: RustClipboardPasteRequest
          projection: VisibleProjectionRequest
        }
        pasteCalls.push(payload.request)
        return {
          acknowledgement: {
            sheetId: payload.request.sheetId,
            requestId: payload.request.requestId,
            revision: 4,
            affectedRange: { rowStart: 1, colStart: 2, rowEnd: 2, colEnd: 4 },
          },
          projection: { ...payload.projection, revision: 4, cells: [] },
        }
      }
      const req = (input as { request: VisibleProjectionRequest }).request
      return { ...req, revision: 3, cells: [] }
    }) as RustWorkbookConnection['request'],
  }
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 12 })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: 's',
    anchor: { row: 1, col: 2 },
    focus: { row: 1, col: 2 },
  })
  render(
    <WorkbookStoreProvider store={store} connection={connection}>
      <TextColumnsTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: 0, colStart: 0, rowEnd: 10, colEnd: 10 },
      reason: 'viewport',
    })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Text to columns' }))
  })
  return { pasteCalls }
}

test('imports .tsv and .csv files with smart delimiter preselection, preview, source toggle and single atomic paste', async () => {
  const { pasteCalls } = await setupFileDialog()
  const input = screen.getByLabelText('Import file…') as HTMLInputElement
  expect(input).toHaveAttribute('accept', '.csv,.txt,.tsv,text/plain,text/csv')
  expect(screen.getByLabelText('Destination cell')).toHaveValue('C2')

  // Reject empty file cleanly without closing dialog.
  await act(async () => {
    fireEvent.change(input, { target: { files: [makeFile('empty.csv', '')] } })
  })
  expect(screen.getByRole('alert')).toHaveTextContent('empty')

  // Import .tsv -> Tab checkbox checked, Comma unchecked, preview table populated immediately.
  const tsv = makeFile('regions.tsv', 'Region\tCode\tQty\r\nEast\t007\t25\r\n', 'text/tab-separated-values')
  await act(async () => {
    fireEvent.change(input, { target: { files: [tsv] } })
  })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText(/Source file: regions\.tsv \(2 rows\)/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Tab' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Comma' })).not.toBeChecked()
  expect(screen.getByRole('table', { name: 'Split preview' })).toHaveTextContent('007')

  // Switch back to worksheet cells and then import .csv -> Comma checked.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Use selected cells' }))
  })
  expect(screen.queryByText(/Source file:/)).toBeNull()

  const csv = makeFile('sales.csv', 'City,Zip,Total\rParis,07501,300', 'text/csv')
  await act(async () => {
    fireEvent.change(input, { target: { files: [csv] } })
  })
  expect(screen.getByRole('checkbox', { name: 'Comma' })).toBeChecked()
  expect(screen.getByRole('table', { name: 'Split preview' })).toHaveTextContent('07501')

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply split' }))
  })
  expect(pasteCalls).toHaveLength(1)
  expect(pasteCalls[0]).toMatchObject({
    sheetId: 's',
    row: 1,
    col: 2,
    mode: 'values',
    text: "'City\t'Zip\t'Total\n'Paris\t'07501\t'300",
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
