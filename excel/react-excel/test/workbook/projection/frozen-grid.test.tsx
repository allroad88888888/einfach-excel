import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  type VisibleProjectionResult,
} from '@einfach-excel/spreadsheet-ui-core'
import { projectionSnapshotBackingAtom } from '../../../../spreadsheet-ui-core/src/projection/state'
import { viewportSizeOverridesAtom } from '../../../../spreadsheet-ui-core/src/viewport/size-overrides'
import { act, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FrozenGrid } from '../../../src/workbook/grid/viewport/FrozenGrid'

/** 三个原生投影矩形；非默认轴尺寸用于抓出按默认尺寸重复计算的错位。 */
function projection(): VisibleProjectionResult {
  return {
    kind: 'visible-window', sheetId: 's', requestId: 1,
    window: { rowStart: 5, rowEnd: 10, colStart: 3, colEnd: 5 }, cells: [],
    freeze: { rows: 2, cols: 1 },
    frozen: { height: 60, width: 100, regions: [
      { pane: 'corner', window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 },
        cells: [{ row: 0, col: 0, displayValue: 'Corner' }] },
      { pane: 'top', window: { rowStart: 0, rowEnd: 1, colStart: 3, colEnd: 3 },
        cells: [{ row: 0, col: 3, displayValue: 'Top' }] },
      { pane: 'left', window: { rowStart: 5, rowEnd: 5, colStart: 0, colEnd: 0 },
        cells: [{ row: 5, col: 0, displayValue: 'Left' }] },
    ] },
  }
}

function setup(result: VisibleProjectionResult | undefined = projection()) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book', sheets: [{ id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 20 }],
  })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { '0': 40 } }, colWidthsBySheet: { s: { '0': 100 } },
  })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), sheetId: 's',
    rowHeight: 20, colWidth: 80, rowCount: 100, colCount: 20,
    viewportHeight: 200, viewportWidth: 400, scrollTop: 60, scrollLeft: 160,
  })
  store.setter(projectionSnapshotBackingAtom, { status: 'ready', result })
  const view = render(
    <WorkbookStoreProvider store={store}><FrozenGrid focusGrid={vi.fn()} /></WorkbookStoreProvider>,
  )
  const pane = (name: string) => view.container.querySelector(`[data-frozen-pane="${name}"]`)
  return { store, ...view, pane }
}

test('positions three panes using the same sparse geometry and deduplicates fixed headings', () => {
  const { pane } = setup()
  expect(pane('corner')).toHaveStyle({ top: '28px', left: '46px', width: '100px', height: '60px' })
  expect(pane('top')).toHaveStyle({ top: '28px', left: '146px', width: '300px', height: '60px' })
  expect(pane('left')).toHaveStyle({ top: '88px', left: '46px', width: '100px', height: '140px' })
  for (const name of ['corner', 'top', 'left']) {
    expect(pane(name)?.querySelector('.grid-surface')).toHaveStyle({ top: '0px', left: '0px' })
  }
  expect(screen.getByRole('cell', { name: 'Corner' })).toHaveAttribute('data-cell', '0:0')
  expect(screen.getByRole('cell', { name: 'Top' })).toHaveAttribute('data-cell', '0:3')
  expect(screen.getByRole('cell', { name: 'Left' })).toHaveAttribute('data-cell', '5:0')
  expect(screen.getAllByRole('columnheader')).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: /^Select row/ })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Select row 1' }).parentElement)
    .toHaveStyle({ top: '0px', height: '40px' })
  expect(screen.getByRole('button', { name: 'Select row 2' }).parentElement)
    .toHaveStyle({ top: '40px', height: '20px' })
})

test('scroll changes translate only the moving axis and leave the frozen corner fixed', () => {
  const { store, pane } = setup()
  act(() => store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), scrollTop: 70, scrollLeft: 190,
  }))
  expect(pane('corner')?.querySelector('.grid-surface'))
    .toHaveStyle({ top: '0px', left: '0px' })
  expect(pane('top')?.querySelector('.grid-surface'))
    .toHaveStyle({ top: '0px', left: '-30px' })
  expect(pane('left')?.querySelector('.grid-surface'))
    .toHaveStyle({ top: '-10px', left: '0px' })
})

test('freeze bands larger than the viewport clip the corner and omit zero-area panes', () => {
  const { store, pane } = setup()
  act(() => store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), viewportHeight: 30, viewportWidth: 50,
  }))
  expect(pane('corner')).toHaveStyle({ width: '50px', height: '30px' })
  expect(pane('top')).toBeNull()
  expect(pane('left')).toBeNull()
})

test.each(['top', 'left'] as const)('%s-only freezing does not manufacture other panes', (axis) => {
  const result = projection()
  result.freeze = { rows: axis === 'top' ? 2 : 0, cols: axis === 'left' ? 1 : 0 }
  result.frozen = {
    height: axis === 'top' ? 60 : 0, width: axis === 'left' ? 100 : 0,
    regions: result.frozen!.regions.filter((region) => region.pane === axis),
  }
  const { pane } = setup(result)
  expect(pane(axis)).not.toBeNull()
  expect(pane('corner')).toBeNull()
  expect(pane(axis === 'top' ? 'left' : 'top')).toBeNull()
})

test.each(['no result', 'other sheet', 'no regions', 'no configuration', 'unfreeze'])(
  '%s removes the previous fixed content', (reason) => {
    const { store, container } = setup()
    const next = projection()
    if (reason === 'other sheet') next.sheetId = 'other'
    if (reason === 'no regions') delete next.frozen
    if (reason === 'no configuration') delete next.freeze
    if (reason === 'unfreeze') next.freeze = { rows: 0, cols: 0 }
    act(() => store.setter(projectionSnapshotBackingAtom, {
      status: 'ready', result: reason === 'no result' ? undefined : next,
    }))
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Corner')).toBeNull()
  },
)
