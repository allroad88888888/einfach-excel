import { createStore } from '@einfach/core'
import {
  editingSessionAtom,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  type VisibleProjectionRequest,
  type RustWorkbookConnection,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FormulaBar } from '../../../src/workbook/chrome/formula-bar/FormulaBar'

test('offscreen target cannot accept formula input before its original value arrives', async () => {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Orders', index: 0, rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  let finish!: () => void
  const request = (async (
    _cmd: string,
    { request: input }: { request: VisibleProjectionRequest },
  ) => {
    if (input.window.rowStart > 0)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    return { ...input, cells: [], revision: 0 }
  }) as RustWorkbookConnection['request']
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <FormulaBar />
    </WorkbookStoreProvider>,
  )
  const editor = screen.getByRole('textbox', { name: 'Active cell value' })
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  expect(editor).toBeEnabled()
  act(() => {
    store.setter(selectCellAtom, { sheetId: 's', coord: { row: 79, col: 0 } })
  })
  expect(editor).toBeDisabled()
  let pending!: Promise<unknown>
  await act(async () => {
    pending = store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: 79, rowEnd: 89, colStart: 0, colEnd: 7 },
    })
  })
  expect(editor).toBeDisabled()
  await act(async () => {
    finish()
    await pending
  })
  expect(editor).toBeEnabled()
  fireEvent.input(editor, { target: { value: '=DATE(1970,1,1)' } })
  expect(store.getter(editingSessionAtom)).toMatchObject({
    draft: '=DATE(1970,1,1)',
    source: { sheetId: 's', cell: { row: 79, col: 0 } },
  })
  // 已打开的草稿不依赖随后滚动到哪里，不能因投影离开目标而禁用或丢失。
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  expect(editor).toBeEnabled()
  expect(editor).toHaveValue('=DATE(1970,1,1)')
})
