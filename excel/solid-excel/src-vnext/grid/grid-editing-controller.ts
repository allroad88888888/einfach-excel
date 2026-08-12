import {
  editingSessionAtom,
  getSelectionRange,
  nextHistoryTransactionId,
  resolveContentMutationAtom,
  selectCellAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import { dispatchEditingCommit, recordHistoryEntry, reportCommandFailure } from '../provider'
import type { GridContextMenuApi } from './grid-context-menu'
import type { GridProjectionControllerApi } from './grid-projection-controller'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridSelectionApi } from './grid-selection'
import type { GridViewStateApi } from './grid-view-state'

type GridEditingControllerRuntime = GridRuntimeBase &
  Pick<GridSelectionApi, 'getSelectionBounds'> &
  Pick<GridViewStateApi, 'selectionRegions'> &
  Pick<GridContextMenuApi, 'focusGrid'> &
  Pick<GridProjectionControllerApi, 'requestProjection' | 'loadProjection'>

export function installGridEditingController(runtime: GridEditingControllerRuntime) {
  const { props, store, backend, selectionRegions, getSelectionBounds, requestProjection, loadProjection } = runtime

  async function commitCellEdit(move: 'none' | 'down' | 'up' | 'left' | 'right' = 'none') {
    const session = store.getter(editingSessionAtom)
    if (session.status !== 'drafting' || session.source === null) return
    const source = session.source
    const outcome = await dispatchEditingCommit(store, backend, { move, source: 'cell' })
    if (outcome !== 'completed') return
    if (move === 'none') return
    const bounds = getSelectionBounds()
    const next = { row: source.cell.row, col: source.cell.col }
    if (move === 'down') next.row = Math.min(bounds.rowCount - 1, next.row + 1)
    else if (move === 'up') next.row = Math.max(0, next.row - 1)
    else if (move === 'right') next.col = Math.min(bounds.colCount - 1, next.col + 1)
    else if (move === 'left') next.col = Math.max(0, next.col - 1)
    store.setter(selectCellAtom, { sheetId: source.sheetId, coord: next, extend: false })
    runtime.focusGrid()
  }

  async function clearSelectionRange(target: 'values' | 'formats' | 'all' = 'all') {
    const regions = selectionRegions().filter((region: { sheetId: string }) => region.sheetId === props.sheetId)
    if (regions.length === 0) return
    const bounds = getSelectionBounds()
    const ranges = regions.map((region: Parameters<typeof getSelectionRange>[0]) => getSelectionRange(region, bounds))
    const resolvedRanges: CellRange[][] = []
    for (const range of ranges) {
      const resolution = store.setter(resolveContentMutationAtom, { kind: 'clear-range', sheetId: props.sheetId, range, protectionGate: target !== 'formats' })
      if (resolution.status === 'blocked') return
      resolvedRanges.push((resolution.ranges ?? [range]).map((sourceRange: CellRange) => ({ ...sourceRange })))
    }
    if (regions.length === 1 && target === 'values') {
      const range = ranges[0]
      if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) {
        const sourceRange = resolvedRanges[0][0]
        let result: Awaited<ReturnType<typeof backend.setCellInput>>
        try {
          result = await backend.setCellInput({ kind: 'set-cell-input', sheetId: props.sheetId, row: sourceRange.rowStart, col: sourceRange.colStart, input: '' })
        } catch (error) {
          reportCommandFailure(store, error, 'Clearing the selected cell failed.')
          return
        }
        const revision = typeof result?.revision === 'number' ? result.revision : Number(result?.revision ?? 0) || 0
        recordHistoryEntry(store, backend, { transactionId: nextHistoryTransactionId(), kind: 'cell.set-input', sheetId: props.sheetId, projectionRevision: revision, affectedRange: result?.affectedRange ?? sourceRange })
        await loadProjection(requestProjection())
        return
      }
    }
    if (!backend.clearRange) return
    for (const range of resolvedRanges.flat()) {
      const result = await backend.clearRange({ kind: 'clear-range', sheetId: props.sheetId, range, target })
      const revision = typeof result?.revision === 'number' ? result.revision : Number(result?.revision ?? 0) || 0
      recordHistoryEntry(store, backend, { transactionId: nextHistoryTransactionId(), kind: 'range.clear', sheetId: props.sheetId, projectionRevision: revision, affectedRange: result?.affectedRange ? { ...result.affectedRange } : { ...range } })
    }
    await loadProjection(requestProjection())
  }

  return installGridFeature(runtime, { commitCellEdit, clearSelectionRange })
}

export type GridEditingControllerApi = ReturnType<typeof installGridEditingController>
