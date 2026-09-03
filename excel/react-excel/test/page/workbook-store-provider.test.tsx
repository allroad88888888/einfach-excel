import { createStore, type Store } from '@einfach/core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  selectCellAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'

function createBoundedStore(): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  return store
}

function SelectionProbe({ label }: { readonly label: string }) {
  const selection = useAtomValue(selectionSnapshotAtom)
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

describe('WorkbookStoreProvider isolation', () => {
  it('keeps two explicitly injected stores independent', () => {
    const leftStore = createBoundedStore()
    const rightStore = createBoundedStore()
    render(
      <>
        <WorkbookStoreProvider store={leftStore}>
          <SelectionProbe label="left" />
        </WorkbookStoreProvider>
        <WorkbookStoreProvider store={rightStore}>
          <SelectionProbe label="right" />
        </WorkbookStoreProvider>
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'left:0:0' }))

    expect(screen.getByRole('button', { name: 'left:3:4' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'right:0:0' })).toBeVisible()
  })
})
