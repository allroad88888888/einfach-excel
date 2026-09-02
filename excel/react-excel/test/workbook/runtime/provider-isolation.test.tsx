import { createStore, type Store } from '@einfach/core'
import { useSetAtom } from '@einfach/react'
import {
  selectCellAtom,
  setSelectionBoundsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'
import { useWorkbookSelection } from '../../../src/workbook/selection/use-workbook-selection'

function createBoundedStore(): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  return store
}

function SelectionProbe({ label }: { readonly label: string }) {
  const selection = useWorkbookSelection()
  const selectCell = useSetAtom(selectCellAtom)
  return (
    <button
      type="button"
      onClick={() => selectCell({ sheetId: 'sheet-1', coord: { row: 3, col: 4 } })}
    >
      {label}:{selection.activeCell.row}:{selection.activeCell.col}
    </button>
  )
}

describe('WorkbookRuntimeProvider isolation', () => {
  it('keeps two explicitly injected stores independent', () => {
    const backend = {} as SpreadsheetBackend
    const leftStore = createBoundedStore()
    const rightStore = createBoundedStore()
    render(
      <>
        <WorkbookRuntimeProvider backend={backend} store={leftStore}>
          <SelectionProbe label="left" />
        </WorkbookRuntimeProvider>
        <WorkbookRuntimeProvider backend={backend} store={rightStore}>
          <SelectionProbe label="right" />
        </WorkbookRuntimeProvider>
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'left:0:0' }))

    expect(screen.getByRole('button', { name: 'left:3:4' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'right:0:0' })).toBeVisible()
  })
})
