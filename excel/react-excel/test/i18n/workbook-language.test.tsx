import { createStore } from '@einfach/core'
import {
  editingDraftAtom, editingSessionAtom, selectionSnapshotAtom, workbookRibbonTabAtom,
} from '@einfach/spreadsheet-ui-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { LanguageSelect } from '../../src/workbook/chrome/header/LanguageSelect'
import { RibbonTabs } from '../../src/workbook/chrome/ribbon/RibbonTabs'
import {
  createControlledCellEditingConnection, firstEditingCell, focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../support/cell-editing-harness'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

test('switches live labels without remounting the editor, resetting selection or writing data', async () => {
  const controlled = createControlledCellEditingConnection()
  const store = renderSalesOrdersEditingWorksheet(controlled)
  await firstEditingCell()
  const grid = screen.getByLabelText('Sales Orders cells')
  grid.focus()
  fireEvent.keyDown(grid, { key: 'F2' })
  const editor = await focusedCellEditor()
  fireEvent.change(editor, { target: { value: '=SUM(1,2)' } })
  editor.setSelectionRange(2, 4)
  const selection = store.getter(selectionSnapshotAtom)
  const session = store.getter(editingSessionAtom)
  fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), {
    target: { value: 'zh' },
  })
  expect(screen.getByRole('button', { name: '粗体' })).toBeVisible()
  expect(screen.getByRole('tab', { name: '开始' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('textbox', { name: '单元格编辑器' })).toBe(editor)
  expect(editor).toHaveValue('=SUM(1,2)')
  expect(editor).toHaveFocus()
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 4])
  expect(store.getter(editingDraftAtom)).toBe('=SUM(1,2)')
  expect(store.getter(editingSessionAtom)).toBe(session)
  expect(store.getter(selectionSnapshotAtom)).toBe(selection)
  expect(controlled.setCellInput).not.toHaveBeenCalled()
  expect(document.querySelector('.workbook')).toHaveAttribute('lang', 'zh')
  fireEvent.keyDown(editor, { key: 'Escape' })
  fireEvent.click(screen.getByRole('tab', { name: '公式' }))
  expect(store.getter(workbookRibbonTabAtom)).toBe('Formulas')
  expect(screen.getByRole('combobox', { name: '快捷公式' })).toBeVisible()
  fireEvent.change(screen.getByRole('combobox', { name: '界面语言' }), { target: { value: 'en' } })
  expect(screen.getByRole('toolbar', { name: 'Formulas tools' })).toBeVisible()
  expect(store.getter(workbookRibbonTabAtom)).toBe('Formulas')
})

test('two default workbooks keep independent UI language and ribbon state', () => {
  const first = createStore()
  const second = createStore()
  render(<>
    <WorkbookStoreProvider store={first}><RibbonTabs id="first" /><LanguageSelect /></WorkbookStoreProvider>
    <WorkbookStoreProvider store={second}><RibbonTabs id="second" /><LanguageSelect /></WorkbookStoreProvider>
  </>)
  const lists = screen.getAllByRole('tablist')
  fireEvent.click(within(lists[1]).getByRole('tab', { name: 'Formulas' }))
  fireEvent.change(screen.getAllByRole('combobox', { name: 'Interface language' })[0], {
    target: { value: 'zh' },
  })
  expect(screen.getAllByRole('combobox', { name: '界面语言' })).toHaveLength(1)
  expect(screen.getAllByRole('combobox', { name: 'Interface language' })).toHaveLength(1)
  expect(within(lists[0]).getByRole('tab', { name: '开始' })).toHaveAttribute('aria-selected', 'true')
  expect(within(lists[1]).getByRole('tab', { name: 'Formulas' })).toHaveAttribute('aria-selected', 'true')
  expect(first.getter(workbookRibbonTabAtom)).toBe('Start')
  expect(second.getter(workbookRibbonTabAtom)).toBe('Formulas')
})
