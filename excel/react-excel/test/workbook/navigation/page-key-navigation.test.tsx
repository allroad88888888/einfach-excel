import { selectionSnapshotAtom, viewportMetricsAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../../../src/workbook/grid/viewport/workbook-grid-config'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('workbook page-key navigation', () => {
  it('moves by the rendered page size and keeps the target visible', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(requests).toHaveLength(1))
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()

    fireEvent.keyDown(grid, { key: 'PageDown' })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 32, col: 0 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(WORKBOOK_GRID_ROW_HEIGHT)
    await waitFor(() => expect(requests).toHaveLength(2))
    await waitFor(() => expect(document.querySelector('[data-cell="32:0"]')).toBeInTheDocument())

    fireEvent.keyDown(grid, { key: 'PageUp' })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(0)
    await waitFor(() => expect(requests).toHaveLength(3))
  })
})
