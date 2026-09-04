import { selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('workbook Tab-key navigation', () => {
  it('moves right with Tab and left with Shift+Tab without leaving the grid', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(requests).toHaveLength(1))
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()

    fireEvent.keyDown(grid, { key: 'Tab' })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 1 })
    expect(document.querySelector('[data-cell="0:1"]')).toHaveAttribute('data-selected', 'true')
    expect(grid).toHaveFocus()

    fireEvent.keyDown(grid, { key: 'Tab', shiftKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    expect(document.querySelector('[data-cell="0:0"]')).toHaveAttribute('data-selected', 'true')
    expect(grid).toHaveFocus()
  })
})
