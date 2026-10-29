import { createStore } from '@einfach/core'
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { initializeWorkbookDocumentAtom, selectCellAtom, setMultiRegionSelectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookFooter } from '../../../src/workbook/chrome/footer/WorkbookFooter'

test('footer counts all areas and removes the write limitation when returning to one cell', () => {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  store.setter(setMultiRegionSelectionAtom, { regions: [
    { kind: 'range', sheetId: 's', anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } },
    { kind: 'range', sheetId: 's', anchor: { row: 3, col: 2 }, focus: { row: 3, col: 3 } },
  ] })
  render(<WorkbookStoreProvider store={store}><WorkbookFooter /></WorkbookStoreProvider>)
  expect(screen.getByText('Selected: 4')).toBeVisible()
  expect(screen.getByRole('status', { name: 'Multi-area selection' }))
    .toHaveTextContent('Clear and formatting apply to all areas. Borders require one continuous range.')
  act(() => store.setter(selectCellAtom, { sheetId: 's', coord: { row: 5, col: 5 } }))
  expect(screen.getByText('Selected: 1')).toBeVisible()
  expect(screen.queryByRole('status', { name: 'Multi-area selection' })).toBeNull()
})
