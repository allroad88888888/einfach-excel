import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { writeBrowserClipboardExport } from '../../../src/workbook/clipboard/browser-clipboard'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

vi.mock('../../../src/workbook/clipboard/browser-clipboard', () => ({
  readBrowserClipboard: vi.fn(),
  writeBrowserClipboard: vi.fn(),
  writeBrowserClipboardExport: vi.fn(async (_format, data) => {
    await data
  }),
}))

beforeEach(() => vi.clearAllMocks())

async function setup() {
  const controlled = createControlledCellEditingConnection()
  const exportRange = vi.fn(async () => ({
    text: 'export',
    html: '<table></table>',
    rows: 1,
    cols: 1,
  }))
  renderSalesOrdersEditingWorksheet({
    ...controlled,
    connection: createTestRustWorkbookConnection({
      readVisibleProjection: controlled.readVisibleProjection,
      exportClipboard: exportRange,
    }),
  })
  const cell = await firstEditingCell()
  return { cell, exportRange, menu: screen.getByRole('combobox', { name: 'Copy as' }) }
}

describe('Copy As menu', () => {
  test.each(['text', 'markdown', 'html'] as const)(
    '%s sends one export and resets the menu',
    async (format) => {
      const { menu, exportRange } = await setup()
      fireEvent.change(menu, { target: { value: format } })
      await waitFor(() =>
        expect(screen.getByLabelText('Clipboard status')).toHaveTextContent(`as ${format}`),
      )
      expect(exportRange).toHaveBeenCalledTimes(1)
      expect(exportRange).toHaveBeenCalledWith(expect.objectContaining({ format }))
      expect(writeBrowserClipboardExport).toHaveBeenCalledWith(format, expect.any(Promise))
      expect(menu).toHaveValue('')
      expect(menu).not.toBeDisabled()
    },
  )

  test('is disabled while editing without reading unfinished cell data', async () => {
    const { menu, cell, exportRange } = await setup()
    fireEvent.doubleClick(cell)
    await waitFor(() => expect(menu).toBeDisabled())
    expect(exportRange).not.toHaveBeenCalled()
  })

  test('a clipboard failure is visible and the same menu can retry', async () => {
    vi.mocked(writeBrowserClipboardExport).mockRejectedValueOnce(new Error('Permission denied'))
    const { menu } = await setup()
    fireEvent.change(menu, { target: { value: 'html' } })
    expect(await screen.findByRole('alert', { name: 'Clipboard status' })).toHaveTextContent(
      'Permission denied',
    )
    await waitFor(() => expect(menu).not.toBeDisabled())
    fireEvent.change(menu, { target: { value: 'html' } })
    await waitFor(() =>
      expect(screen.getByLabelText('Clipboard status')).toHaveTextContent('as html'),
    )
  })
})
