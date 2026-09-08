import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { projectionSnapshotBackingAtom } from '../../../../spreadsheet-ui-core/src/projection/state'
import { activateWorkbookSheetAtom } from '../../../../spreadsheet-ui-core/src/runtime/activate-workbook-sheet'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { NameBox } from '../../../src/workbook/chrome/formula-bar/NameBox'

test.each(['Enter', 'blur'])(
  'name box targets the new sheet while the old projection is retained (%s)',
  (commit) => {
    const store = createStore()
    const sheets = ['orders', 'summary'].map((id, index) => ({
      id,
      index,
      name: id,
      rowCount: 100,
      colCount: 8,
    }))
    store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets })
    store.setter(projectionSnapshotBackingAtom, {
      status: 'ready',
      request: undefined,
      error: undefined,
      result: {
        kind: 'visible-window',
        sheetId: 'orders',
        requestId: 1,
        cells: [],
        window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 },
        mergedRanges: [{ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }],
      },
    })
    render(
      <WorkbookStoreProvider store={store}>
        <NameBox />
      </WorkbookStoreProvider>,
    )
    // 模拟 Worker 尚未返回新表：旧画面可保留，但不能决定名称框写入哪张表。
    act(() => {
      store.setter(activateWorkbookSheetAtom, sheets[1]!)
    })
    expect(store.getter(selectionSnapshotAtom).selection.sheetId).toBe('summary')
    const input = screen.getByRole('textbox', { name: 'Name box' })
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'C5' } })
    if (commit === 'Enter') fireEvent.keyDown(input, { key: 'Enter' })
    else fireEvent.blur(input)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
      sheetId: 'summary',
      row: 4,
      col: 2,
    })
  },
)
