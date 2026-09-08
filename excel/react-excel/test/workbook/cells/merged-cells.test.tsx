import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  viewportSizeOverridesAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  sheetHiddenRowsBackingAtom,
  viewportHiddenColsBackingAtom,
} from '../../../../spreadsheet-ui-core/src/viewport/hidden-state'
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { MergedCells } from '../../../src/workbook/grid/cells/MergedCells'

async function setup() {
  const request = (async (_command: string, input: { request: VisibleProjectionRequest }) => ({
    ...input.request,
    cells: [],
    mergedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 }],
    mergeAnchors: [
      {
        row: 1,
        col: 1,
        displayValue: 'Offscreen anchor',
        mergedSpan: { rows: 3, cols: 3 },
        format: { bold: true, align: 'center', verticalAlign: 'center' },
      },
    ],
  })) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 10 }],
  })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom),
    sheetId: 's',
    rowCount: 100,
    colCount: 10,
    rowHeight: 20,
    colWidth: 100,
  })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 1: 40 } },
    colWidthsBySheet: { s: { 1: 150 } },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 2 } })
  render(
    <WorkbookStoreProvider store={store}>
      <MergedCells />
    </WorkbookStoreProvider>,
  )
  return store
}

test('offscreen anchor renders once with full sparse geometry and accessible span', async () => {
  await setup()
  const cell = screen.getByRole('gridcell')
  expect(cell).toHaveTextContent('Offscreen anchor')
  expect(cell).toHaveAttribute('data-cell', '1:1')
  expect(cell).toHaveAttribute('aria-rowspan', '3')
  expect(cell).toHaveAttribute('aria-colspan', '3')
  expect(cell).toHaveAttribute('aria-selected', 'true')
  expect(cell).toHaveStyle({
    top: '-40px',
    left: '-150px',
    height: '80px',
    width: '350px',
    textAlign: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  })
})

test('hidden anchor axes collapse only their own size; a fully hidden merge is not mounted', async () => {
  const store = await setup()
  act(() => {
    store.setter(sheetHiddenRowsBackingAtom, { s: [1] })
    store.setter(viewportHiddenColsBackingAtom, { s: [1] })
  })
  expect(screen.getByRole('gridcell')).toHaveStyle({
    top: '0px',
    left: '0px',
    height: '40px',
    width: '200px',
  })
  act(() => {
    store.setter(sheetHiddenRowsBackingAtom, { s: [1, 2, 3] })
  })
  expect(screen.queryByRole('gridcell')).toBeNull()
})

test('a projection from another sheet cannot render over the active sheet', async () => {
  const store = await setup()
  act(() => {
    store.setter(setViewportMetricsAtom, { ...store.getter(viewportMetricsAtom), sheetId: 'other' })
  })
  expect(screen.queryByRole('gridcell')).toBeNull()
})
