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

async function setup(bordered = false, hidden = false) {
  const request = (async (_command: string, input: { request: VisibleProjectionRequest }) => ({
    ...input.request,
    cells: bordered ? [{ row: 2, col: 3, displayValue: '',
      format: { borders: { right: { style: 'thin', color: '#123abc' } } } }] : [],
    mergedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 }],
    ...(hidden ? {
      visibility: { manualRows: [1], filterRows: [], manualColumns: [1] },
      mergeBorderCells: [{ row: 1, col: 2, displayValue: '',
        format: { borders: { top: { style: 'thin', color: '#123abc' } } } }],
    } : {}),
    mergeAnchors: [
      {
        row: 1,
        col: 1,
        displayValue: 'Offscreen anchor',
        mergedSpan: { rows: 3, cols: 3 },
        format: { bold: true, align: 'center', verticalAlign: 'center',
          ...(bordered ? { borders: {
            right: { style: 'thick', color: '#c00000' },
            bottom: { style: 'thick', color: '#c00000' },
            top: { style: 'thick', color: '#c00000' },
            left: { style: 'thick', color: '#c00000' },
          } } : {}),
        },
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

test('offscreen merge paints only visible perimeter segments and leaves the text intact', async () => {
  await setup(true)
  const merged = screen.getByRole('gridcell')
  const segment = (side: string, coord: string) =>
    merged.querySelector(`[data-merged-border="${side}"][data-border-cell="${coord}"]`)
  expect(merged).toHaveTextContent('Offscreen anchor')
  expect(merged).toHaveStyle({ borderWidth: '0px' })
  expect(segment('right', '2:3')).toHaveStyle({
    borderRightWidth: '1px', borderRightColor: '#123abc', left: '250px', top: '40px',
  })
  expect(segment('right', '3:3')).toHaveStyle({ borderRightWidth: '3px', borderRightColor: '#c00000' })
  expect(segment('bottom', '3:2')).toHaveStyle({ borderBottomWidth: '3px' })
  expect(merged.querySelectorAll('[data-merged-border]')).toHaveLength(4)
  expect(merged.querySelector('[data-merged-border="top"]')).toBeNull()
  expect(merged.querySelector('[data-merged-border="left"]')).toBeNull()
})

test('hidden offscreen anchor axes retain physical edge segments at the collapsed boundary', async () => {
  await setup(true, true)
  const merged = screen.getByRole('gridcell')
  expect(merged).toHaveStyle({ top: '0px', left: '0px', width: '200px', height: '40px' })
  expect(merged.querySelector('[data-merged-border="top"][data-border-cell="1:2"]'))
    .toHaveStyle({ borderTopColor: '#123abc', borderTopWidth: '1px', top: '0px' })
  expect(merged.querySelector('[data-merged-border="top"][data-border-cell="1:3"]'))
    .toHaveStyle({ borderTopColor: '#c00000', borderTopWidth: '3px' })
  expect(merged.querySelector('[data-merged-border="left"][data-border-cell="2:1"]'))
    .toHaveStyle({ borderLeftColor: '#c00000', borderLeftWidth: '3px', left: '0px' })
})
