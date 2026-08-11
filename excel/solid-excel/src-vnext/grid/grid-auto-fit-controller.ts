import {
  MAX_VIEWPORT_COL_WIDTH,
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  MIN_VIEWPORT_ROW_HEIGHT,
  cancelPointerAtom,
  setViewportColumnWidthAtom,
  setViewportRowHeightAtom,
} from '@einfach/spreadsheet-ui-core'
import { reportCommandFailure } from '../provider/command-failure'
import { clampDimension, measureAutoFitHeight, measureAutoFitWidth } from './grid-auto-fit'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'

export function installGridAutoFitController(runtime: GridRuntimeBase) {
  const { props, store, backend, dom } = runtime

  function cancelConflictingPointerInteractions(): void {
    dom.cancelDragSelection()
    dom.cancelFill()
    dom.cancelResize()
    store.setter(cancelPointerAtom)
  }

  async function persistColumnWidth(colIndex: number, widthPx: number) {
    if (!backend.setColumnWidth) return
    await backend.setColumnWidth({
      kind: 'set-column-width',
      sheetId: props.sheetId,
      colIndex,
      widthPx,
    })
  }

  async function persistRowHeight(rowIndex: number, heightPx: number) {
    if (!backend.setRowHeight) return
    await backend.setRowHeight({
      kind: 'set-row-height',
      sheetId: props.sheetId,
      rowIndex,
      heightPx,
    })
  }

  function getAutoFitColumnWidth(col: number): number {
    const gridRoot = dom.gridRoot()
    const headerLabel = gridRoot?.querySelector(
      `.spreadsheet-grid-col-header[data-col="${col}"] .spreadsheet-grid-header-label`,
    ) as HTMLElement | null
    let width = headerLabel ? measureAutoFitWidth(headerLabel) : props.viewport.colWidth
    const cells = gridRoot?.querySelectorAll(
      `td.spreadsheet-grid-cell[data-col="${col}"] .cell-display`,
    )
    cells?.forEach((cell) => {
      width = Math.max(width, measureAutoFitWidth(cell as HTMLElement))
    })
    return clampDimension(width, MIN_VIEWPORT_COL_WIDTH, MAX_VIEWPORT_COL_WIDTH)
  }

  function getAutoFitRowHeight(row: number): number {
    const gridRoot = dom.gridRoot()
    const rowLabel = gridRoot?.querySelector(
      `.spreadsheet-grid-row-header[data-row="${row}"] .spreadsheet-grid-header-label`,
    ) as HTMLElement | null
    let height = rowLabel ? measureAutoFitHeight(rowLabel) : props.viewport.rowHeight
    const cells = gridRoot?.querySelectorAll(
      `td.spreadsheet-grid-cell[data-row="${row}"] .cell-display`,
    )
    cells?.forEach((cell) => {
      height = Math.max(height, measureAutoFitHeight(cell as HTMLElement))
    })
    return clampDimension(height, MIN_VIEWPORT_ROW_HEIGHT, MAX_VIEWPORT_ROW_HEIGHT)
  }

  async function autoFitColumn(col: number) {
    cancelConflictingPointerInteractions()
    const widthPx = getAutoFitColumnWidth(col)
    store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: col, widthPx })
    try {
      await persistColumnWidth(col, widthPx)
    } catch (error) {
      reportCommandFailure(store, error, 'Auto-fitting the column failed.')
    }
  }

  async function autoFitRow(row: number) {
    cancelConflictingPointerInteractions()
    const heightPx = getAutoFitRowHeight(row)
    store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: row, heightPx })
    try {
      await persistRowHeight(row, heightPx)
    } catch (error) {
      reportCommandFailure(store, error, 'Auto-fitting the row failed.')
    }
  }

  return installGridFeature(runtime, {
    persistColumnWidth,
    persistRowHeight,
    getAutoFitColumnWidth,
    getAutoFitRowHeight,
    autoFitColumn,
    autoFitRow,
  })
}

export type GridAutoFitControllerApi = ReturnType<typeof installGridAutoFitController>
