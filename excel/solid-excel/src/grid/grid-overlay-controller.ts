import { getSelectionRange, type SelectionState } from '@einfach/spreadsheet-ui-core'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridSelectionApi } from './grid-selection'
import type { GridViewStateApi } from './grid-view-state'

/** Bridges rendered grid DOM geometry to overlay components. */
type GridOverlayControllerRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'projectionSnapshot'> &
  Pick<GridSelectionApi, 'getSelectionBounds' | 'getRows' | 'getCols'>

export function installGridOverlayController(runtime: GridOverlayControllerRuntime) {
  const { props, atoms, dom, projectionSnapshot, getSelectionBounds, getRows, getCols } = runtime

  function getFilterRulesForSheet() {
    return atoms.filterSortState()[props.sheetId]?.rules ?? []
  }

  function colHasFilterRule(col: number): boolean {
    return getFilterRulesForSheet().some((rule: { colIndex: number }) => rule.colIndex === col)
  }

  function findMergeAnchorCovering(row: number, col: number) {
    const gridRoot = dom.gridRoot()
    if (!gridRoot) return null
    const anchors = gridRoot.querySelectorAll<HTMLElement>(
      'td.spreadsheet-grid-cell[data-merge-anchor="true"]',
    )
    for (const element of anchors) {
      const anchorRow = Number(element.dataset.row)
      const anchorCol = Number(element.dataset.col)
      const rowspan = Number(element.getAttribute('rowspan') ?? 1) || 1
      const colspan = Number(element.getAttribute('colspan') ?? 1) || 1
      if (
        row >= anchorRow &&
        row < anchorRow + rowspan &&
        col >= anchorCol &&
        col < anchorCol + colspan
      ) {
        return { el: element, row: anchorRow, col: anchorCol, rowspan, colspan }
      }
    }
    return null
  }

  function getOverlayCellRect(row: number, col: number) {
    const gridRoot = dom.gridRoot()
    const scrollRoot = dom.scrollRoot()
    if (!gridRoot || !scrollRoot) return null
    const td = gridRoot.querySelector(
      `td.spreadsheet-grid-cell[data-row="${row}"][data-col="${col}"]`,
    ) as HTMLElement | null
    if (td) {
      const rootRect = scrollRoot.getBoundingClientRect()
      const cellRect = td.getBoundingClientRect()
      return {
        x: cellRect.left - rootRect.left,
        y: cellRect.top - rootRect.top,
        w: cellRect.width,
        h: cellRect.height,
      }
    }
    const anchor = findMergeAnchorCovering(row, col)
    if (anchor) {
      const rootRect = scrollRoot.getBoundingClientRect()
      const anchorRect = anchor.el.getBoundingClientRect()
      return {
        x: anchorRect.left - rootRect.left,
        y: anchorRect.top - rootRect.top,
        w: anchorRect.width,
        h: anchorRect.height,
      }
    }
    return null
  }

  function resolveSelectionRect(sheetId: string, selection: SelectionState) {
    if (sheetId !== props.sheetId || selection.sheetId !== props.sheetId) return null
    const range = getSelectionRange(selection, getSelectionBounds())
    const rows = getRows().filter((row) => row >= range.rowStart && row <= range.rowEnd)
    const cols = getCols().filter((col) => col >= range.colStart && col <= range.colEnd)
    if (!rows.length || !cols.length) return null
    const topLeft = getOverlayCellRect(rows[0], cols[0])
    const bottomRight = getOverlayCellRect(rows[rows.length - 1], cols[cols.length - 1])
    if (!topLeft || !bottomRight) return null
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: Math.max(0, bottomRight.x + bottomRight.w - topLeft.x),
      height: Math.max(0, bottomRight.y + bottomRight.h - topLeft.y),
    }
  }

  function getOverlaySurfaceSize() {
    const scrollRoot = dom.scrollRoot()
    if (!scrollRoot) return { width: 0, height: 0 }
    const rect = scrollRoot.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  function getOverlayCells() {
    return projectionSnapshot().result?.cells ?? []
  }

  function getOverlayFreezeOrigin() {
    const gridRoot = dom.gridRoot()
    const scrollRoot = dom.scrollRoot()
    if (!gridRoot || !scrollRoot) return { x: 0, y: 0 }
    const corner = gridRoot.querySelector('.spreadsheet-grid-corner') as HTMLElement | null
    if (!corner) return { x: 0, y: 0 }
    const cornerRect = corner.getBoundingClientRect()
    const rootRect = scrollRoot.getBoundingClientRect()
    return { x: cornerRect.right - rootRect.left, y: cornerRect.bottom - rootRect.top }
  }

  return installGridFeature(runtime, {
    getFilterRulesForSheet,
    colHasFilterRule,
    findMergeAnchorCovering,
    getOverlayCellRect,
    resolveSelectionRect,
    getOverlaySurfaceSize,
    getOverlayCells,
    getOverlayFreezeOrigin,
  })
}

export type GridOverlayControllerApi = ReturnType<typeof installGridOverlayController>
