import {
  filterSortStateAtom,
  getSelectionRange,
  presenceStateAtom,
  remoteCursorsAtom,
} from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

/** Bridges rendered grid geometry and collaboration state to overlay components. */
export function installGridOverlayController(runtime: GridRuntime) {
  const {
    props,
    store,
    renderTick,
    projectionSnapshot,
    getSelectionBounds,
    getRows,
    getCols,
    getRenderedRowHeight,
    getRenderedColumnWidth,
  } = runtime

  function getFilterRulesForSheet() {
    renderTick()
    return store.getter(filterSortStateAtom)[props.sheetId]?.rules ?? []
  }

  function colHasFilterRule(col: number): boolean {
    return getFilterRulesForSheet().some((rule: { colIndex: number }) => rule.colIndex === col)
  }

  function getRemoteCursorsForSheet() {
    renderTick()
    const cursors = store.getter(remoteCursorsAtom) as Array<Record<string, any>>
    return cursors.filter((cursor) => cursor.sheetId === props.sheetId)
  }

  function getParticipantColorHint(participantId: string): string | undefined {
    const participants = store.getter(presenceStateAtom).participants as Array<Record<string, any>>
    return participants.find((participant) => participant.id === participantId)
      ?.colorHint
  }

  function findMergeAnchorCovering(row: number, col: number) {
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    if (!gridRoot) return null
    const anchors = gridRoot.querySelectorAll<HTMLElement>(
      'td.spreadsheet-grid-cell[data-merge-anchor="true"]',
    )
    for (const element of anchors) {
      const anchorRow = Number(element.dataset.row)
      const anchorCol = Number(element.dataset.col)
      const rowspan = Number(element.getAttribute('rowspan') ?? 1) || 1
      const colspan = Number(element.getAttribute('colspan') ?? 1) || 1
      if (row >= anchorRow && row < anchorRow + rowspan && col >= anchorCol && col < anchorCol + colspan) {
        return { el: element, row: anchorRow, col: anchorCol, rowspan, colspan }
      }
    }
    return null
  }

  function getOverlayCellRect(row: number, col: number) {
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (!gridRoot || !scrollRoot) return null
    const td = gridRoot.querySelector(
      `td.spreadsheet-grid-cell[data-row="${row}"][data-col="${col}"]`,
    ) as HTMLElement | null
    if (td) {
      const rootRect = scrollRoot.getBoundingClientRect()
      const cellRect = td.getBoundingClientRect()
      return { x: cellRect.left - rootRect.left, y: cellRect.top - rootRect.top, w: cellRect.width, h: cellRect.height }
    }
    const anchor = findMergeAnchorCovering(row, col)
    if (anchor) {
      const rootRect = scrollRoot.getBoundingClientRect()
      const anchorRect = anchor.el.getBoundingClientRect()
      return { x: anchorRect.left - rootRect.left, y: anchorRect.top - rootRect.top, w: anchorRect.width, h: anchorRect.height }
    }
    const rows = getRows() as readonly number[]
    const cols = getCols() as readonly number[]
    if (!rows.length || !cols.length || !rows.includes(row) || !cols.includes(col)) return null
    const x = cols.filter((index) => index < col).reduce((sum, index) => sum + getRenderedColumnWidth(index), 0)
    const y = rows.filter((index) => index < row).reduce((sum, index) => sum + getRenderedRowHeight(index), 0)
    const corner = gridRoot.querySelector('.spreadsheet-grid-corner') as HTMLElement | null
    const header = gridRoot.querySelector(`.spreadsheet-grid-col-header[data-col="${cols[0]}"]`) as HTMLElement | null
    const rowHeader = gridRoot.querySelector(`.spreadsheet-grid-row-header[data-row="${rows[0]}"]`) as HTMLElement | null
    const offsetX = corner?.getBoundingClientRect().width ?? rowHeader?.getBoundingClientRect().width ?? 0
    const offsetY = corner?.getBoundingClientRect().height ?? header?.getBoundingClientRect().height ?? 0
    return { x: offsetX + x, y: offsetY + y, w: getRenderedColumnWidth(col), h: getRenderedRowHeight(row) }
  }

  function getOverlaySurfaceSize() {
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (!scrollRoot) return { width: 0, height: 0 }
    const rect = scrollRoot.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  function getOverlayCells() {
    return projectionSnapshot().result?.cells ?? []
  }

  function getOverlayFreezeOrigin() {
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (!gridRoot || !scrollRoot) return { x: 0, y: 0 }
    const corner = gridRoot.querySelector('.spreadsheet-grid-corner') as HTMLElement | null
    if (!corner) return { x: 0, y: 0 }
    const cornerRect = corner.getBoundingClientRect()
    const rootRect = scrollRoot.getBoundingClientRect()
    return { x: cornerRect.right - rootRect.left, y: cornerRect.bottom - rootRect.top }
  }

  function getRemoteCursorStyle(cursor: Record<string, any>) {
    const range = getSelectionRange(cursor.selection, getSelectionBounds())
    const rows = getRows() as readonly number[]
    const cols = getCols() as readonly number[]
    const top = rows.filter((row) => row < range.rowStart).reduce((sum, row) => sum + getRenderedRowHeight(row), 0)
    const left = cols.filter((col) => col < range.colStart).reduce((sum, col) => sum + getRenderedColumnWidth(col), 0)
    const height = rows.filter((row) => row >= range.rowStart && row <= range.rowEnd).reduce((sum, row) => sum + getRenderedRowHeight(row), 0)
    const width = cols.filter((col) => col >= range.colStart && col <= range.colEnd).reduce((sum, col) => sum + getRenderedColumnWidth(col), 0)
    const color = getParticipantColorHint(cursor.participantId) ?? '#4f90f0'
    return { position: 'absolute', top: `${top}px`, left: `${left}px`, height: `${Math.max(height, 1)}px`, width: `${Math.max(width, 1)}px`, border: `2px solid ${color}`, 'pointer-events': 'none', 'box-sizing': 'border-box' }
  }

  Object.assign(runtime, {
    getFilterRulesForSheet,
    colHasFilterRule,
    getRemoteCursorsForSheet,
    getParticipantColorHint,
    findMergeAnchorCovering,
    getOverlayCellRect,
    getOverlaySurfaceSize,
    getOverlayCells,
    getOverlayFreezeOrigin,
    getRemoteCursorStyle,
  })
}
