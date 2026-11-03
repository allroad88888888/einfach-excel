import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom,
  workbookDocumentAtom,
  type RustWorkbookCommands,
} from '@einfach-excel/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../support/cell-editing-harness'
import { createTestRustWorkbookConnection } from '../support/rust-workbook-connection'

function sheetMenuItem(name: string) {
  const active = within(screen.getByRole('tablist', { name: 'Workbook sheets' }))
    .getByRole('tab', { selected: true })
  fireEvent.contextMenu(active, { clientX: 100, clientY: 600 })
  return within(screen.getByRole('menu', { name: 'Worksheet tab' })).getByRole('menuitem', { name })
}

async function setup() {
  const store = createStore()
  const controlled = createControlledCellEditingConnection()
  const changeSheets = vi.fn(
    async (input: RustWorkbookCommands['workbook.changeSheets']['payload']) => {
      const sheets = store.getter(workbookDocumentAtom).sheets
      const next =
        input.operation === 'delete'
          ? sheets.filter((sheet) => sheet.id !== input.sheetId)
          : [...sheets].reverse()
      return {
        sheets: next.map((sheet, index) => ({ id: sheet.id, name: sheet.name, index })),
        revision: 1,
      }
    },
  )
  renderSalesOrdersEditingWorksheet(
    {
      ...controlled,
      connection: createTestRustWorkbookConnection({
        changeSheets,
        readVisibleProjection: controlled.readVisibleProjection,
        setCellInput: controlled.setCellInput,
      }),
    },
    store,
  )
  const cell = await firstEditingCell()
  return { ...controlled, store, cell, changeSheets }
}

describe('worksheet structural controls', () => {
  test.each([false, true])('deletion confirmation cycles Tab focus with shift=%s', async (shiftKey) => {
    const { changeSheets } = await setup()
    fireEvent.click(sheetMenuItem('Delete sheet'))
    const dialog = await screen.findByRole('alertdialog')
    const first = within(dialog).getByRole('button', { name: 'Cancel' })
    const last = within(dialog).getByRole('button', { name: 'Delete worksheet' })
    const from = shiftKey ? first : last
    from.focus()
    fireEvent.keyDown(from, { key: 'Tab', shiftKey })
    expect(shiftKey ? last : first).toHaveFocus()
    expect(changeSheets).not.toHaveBeenCalled()
  })

  for (const origin of ['grid', 'sheet tab'])
    test.each(['Cancel', 'Escape'])(`%s returns focus to the sheet tab after opening its menu from ${origin}`, async (cancel) => {
      const { changeSheets } = await setup()
      const grid = document.querySelector<HTMLElement>('[data-workbook-grid]')!
      const previous = origin === 'grid' ? grid : screen.getByRole('tab', { name: 'Sales Orders' })
      previous.focus()
      fireEvent.click(sheetMenuItem('Delete sheet'))
      const dialog = await screen.findByRole('alertdialog')
      const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' })
      cancelButton.focus()
      if (cancel === 'Cancel') fireEvent.click(cancelButton)
      else fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(screen.getByRole('tab', { name: 'Sales Orders' })).toHaveFocus()
      expect(changeSheets).not.toHaveBeenCalled()
    })

  test('moves both directions without switching the active worksheet', async () => {
    const { store, changeSheets } = await setup()
    expect(sheetMenuItem('Move sheet left')).toBeDisabled()
    fireEvent.click(sheetMenuItem('Move sheet right'))
    await waitFor(() =>
      expect(
        within(screen.getByRole('tablist', { name: 'Workbook sheets' })).getAllByRole('tab')[0],
      ).toHaveTextContent('Summary'),
    )
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
    expect(sheetMenuItem('Move sheet right')).toBeDisabled()
    fireEvent.click(sheetMenuItem('Move sheet left'))
    await waitFor(() =>
      expect(
        within(screen.getByRole('tablist', { name: 'Workbook sheets' })).getAllByRole('tab')[0],
      ).toHaveTextContent('Sales Orders'),
    )
    expect(changeSheets).toHaveBeenCalledTimes(2)
  })

  test('cancel preserves all tabs; confirming deletes exactly once and keeps one sheet', async () => {
    const { changeSheets } = await setup()
    fireEvent.click(sheetMenuItem('Delete sheet'))
    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Sales Orders')
    expect(dialog).toHaveTextContent('session history limits')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(changeSheets).not.toHaveBeenCalled()
    fireEvent.click(sheetMenuItem('Delete sheet'))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete worksheet' }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Sales Orders' })).toBeNull())
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
    expect(sheetMenuItem('Delete sheet')).toBeDisabled()
    expect(changeSheets).toHaveBeenCalledTimes(1)
  })

  test('native deletion failure stays in the confirmation with a retry', async () => {
    const { changeSheets } = await setup()
    changeSheets.mockRejectedValueOnce(new Error('Deletion rejected'))
    fireEvent.click(sheetMenuItem('Delete sheet'))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete worksheet' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deletion rejected')
    expect(
      within(screen.getByRole('tablist', { name: 'Workbook sheets' })).getAllByRole('tab'),
    ).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete worksheet' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(
      within(screen.getByRole('tablist', { name: 'Workbook sheets' })).getAllByRole('tab'),
    ).toHaveLength(1)
  })

  test('opening confirmation saves a current draft on its source sheet', async () => {
    const { cell, setCellInput } = await setup()
    fireEvent.doubleClick(cell)
    fireEvent.change(screen.getByLabelText('Cell editor'), { target: { value: 'Saved' } })
    const remove = sheetMenuItem('Delete sheet')
    // 菜单获得焦点会先保存单元格草稿；待写入完成后才能执行结构操作。
    await waitFor(() => expect(remove).toBeEnabled())
    fireEvent.click(remove)
    expect(await screen.findByRole('alertdialog')).toBeVisible()
    expect(setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'orders', input: 'Saved' }),
    )
  })
})
