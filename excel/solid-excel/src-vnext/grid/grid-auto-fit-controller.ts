import {
  MAX_VIEWPORT_COL_WIDTH,
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  MIN_VIEWPORT_ROW_HEIGHT,
  setViewportColumnWidthAtom,
  setViewportRowHeightAtom,
} from '@einfach/spreadsheet-ui-core'
import { clampDimension, measureAutoFitHeight, measureAutoFitWidth } from './grid-auto-fit'
import { type GridRuntime } from './grid-runtime'

export function installGridAutoFitController(runtime: GridRuntime) {
  const { props, store, backend, bumpRender } = runtime

  async function persistColumnWidth(colIndex: number, widthPx: number) {
    if (!backend.setColumnWidth) return
    await backend.setColumnWidth({ kind: 'set-column-width', sheetId: props.sheetId, colIndex, widthPx })
  }

  async function persistRowHeight(rowIndex: number, heightPx: number) {
    if (!backend.setRowHeight) return
    await backend.setRowHeight({ kind: 'set-row-height', sheetId: props.sheetId, rowIndex, heightPx })
  }

  function getAutoFitColumnWidth(col: number): number {
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    const headerLabel = gridRoot?.querySelector(`.spreadsheet-grid-col-header[data-col="${col}"] .spreadsheet-grid-header-label`) as HTMLElement | null
    let width = headerLabel ? measureAutoFitWidth(headerLabel) : props.viewport.colWidth
    const cells = gridRoot?.querySelectorAll(`td.spreadsheet-grid-cell[data-col="${col}"] .cell-display`)
    cells?.forEach((cell) => { width = Math.max(width, measureAutoFitWidth(cell as HTMLElement)) })
    return clampDimension(width, MIN_VIEWPORT_COL_WIDTH, MAX_VIEWPORT_COL_WIDTH)
  }

  function getAutoFitRowHeight(row: number): number {
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    const rowLabel = gridRoot?.querySelector(`.spreadsheet-grid-row-header[data-row="${row}"] .spreadsheet-grid-header-label`) as HTMLElement | null
    let height = rowLabel ? measureAutoFitHeight(rowLabel) : props.viewport.rowHeight
    const cells = gridRoot?.querySelectorAll(`td.spreadsheet-grid-cell[data-row="${row}"] .cell-display`)
    cells?.forEach((cell) => { height = Math.max(height, measureAutoFitHeight(cell as HTMLElement)) })
    return clampDimension(height, MIN_VIEWPORT_ROW_HEIGHT, MAX_VIEWPORT_ROW_HEIGHT)
  }

  async function autoFitColumn(col: number) {
    runtime.cancelResize()
    runtime.cancelFill()
    const widthPx = getAutoFitColumnWidth(col)
    store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: col, widthPx })
    bumpRender()
    await persistColumnWidth(col, widthPx)
  }

  async function autoFitRow(row: number) {
    runtime.cancelResize()
    runtime.cancelFill()
    const heightPx = getAutoFitRowHeight(row)
    store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: row, heightPx })
    bumpRender()
    await persistRowHeight(row, heightPx)
  }

  Object.assign(runtime, { persistColumnWidth, persistRowHeight, getAutoFitColumnWidth, getAutoFitRowHeight, autoFitColumn, autoFitRow })
}
