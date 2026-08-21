/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { SpreadsheetGridDataRow } from '../src-vnext/grid/SpreadsheetGridDataRow'
import { SpreadsheetGridTable } from '../src-vnext/grid/SpreadsheetGridTable'

afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
})

describe('vnext grid header resize split', () => {
  it('keeps a column resize handle click out of column selection', () => {
    const selectColumn = jest.fn()
    const startColumnResize = jest.fn()
    const { getByTestId, container } = render(() => (
      <SpreadsheetGridTable
        runtime={
          {
            props: { sheetId: 'sheet-1' },
            store: { setter: jest.fn() },
            getTotalTableWidth: () => 96,
            getRows: () => [0],
            getCols: () => [0],
            hasColOutline: () => false,
            hasRowOutline: () => false,
            showHeadings: () => true,
            getColOutlineBandHeight: () => 0,
            getRowOutlineGutterWidth: () => 0,
            getLeftSpacerWidth: () => 0,
            getRightSpacerWidth: () => 0,
            getColumnStyle: () => ({}),
            isColumnSelected: () => false,
            isColumnInSelection: () => false,
            freezeColCount: () => 0,
            colHasFilterRule: () => false,
            startColumnResize,
            autoFitColumn: jest.fn(),
            getTopSpacerHeight: () => 0,
            getBottomSpacerHeight: () => 0,
            getVirtualColumnSpan: () => 1,
            getCornerStyle: () => ({}),
            isAllSelected: () => false,
            focusGrid: jest.fn(),
            openContextMenu: jest.fn(),
            selectColumn,
            getRenderedRowHeight: () => 24,
            isRowSelected: () => false,
            isRowInSelection: () => false,
            freezeRowCount: () => 0,
            getRowHeaderStyle: () => ({}),
            selectRow: jest.fn(),
            startRowResize: jest.fn(),
            autoFitRow: jest.fn(),
            isCellCoveredByMerge: () => true,
          } as never
        }
      />
    ))
    const header = container.querySelector('.spreadsheet-grid-col-header') as HTMLElement
    const handle = getByTestId('col-resize-0')

    fireEvent.click(header)
    expect(selectColumn).toHaveBeenCalledWith(0, false, false)
    selectColumn.mockClear()

    fireEvent.pointerDown(handle, { button: 0 })
    fireEvent.click(handle)

    expect(startColumnResize).toHaveBeenCalledWith(expect.anything(), 0)
    expect(selectColumn).not.toHaveBeenCalled()
  })

  it('keeps a row resize handle click out of row selection', () => {
    const selectRow = jest.fn()
    const startRowResize = jest.fn()
    const { getByTestId, container } = render(() => (
      <table>
        <tbody>
          <SpreadsheetGridDataRow
            runtime={
              {
                hasRowOutline: () => false,
                showHeadings: () => true,
                getRowOutlineGutterWidth: () => 0,
                getRenderedRowHeight: () => 24,
                isRowSelected: () => false,
                isRowInSelection: () => false,
                freezeRowCount: () => 0,
                getRowHeaderStyle: () => ({}),
                selectRow,
                openContextMenu: jest.fn(),
                getLeftSpacerWidth: () => 0,
                getCols: () => [],
                getRightSpacerWidth: () => 0,
                startRowResize,
                autoFitRow: jest.fn(),
              } as never
            }
            row={0}
          />
        </tbody>
      </table>
    ))
    const header = container.querySelector('.spreadsheet-grid-row-header') as HTMLElement
    const handle = getByTestId('row-resize-0')

    fireEvent.click(header)
    expect(selectRow).toHaveBeenCalledWith(0, false, false)
    selectRow.mockClear()

    fireEvent.pointerDown(handle, { button: 0 })
    fireEvent.click(handle)

    expect(startRowResize).toHaveBeenCalledWith(expect.anything(), 0)
    expect(selectRow).not.toHaveBeenCalled()
  })
})
