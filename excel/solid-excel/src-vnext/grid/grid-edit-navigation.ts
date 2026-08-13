import {
  activeCellLockedAtom,
  clearLockedEditFeedbackForCellAtom,
  reportLockedEditFeedbackAtom,
  selectCellAtom,
  startEditingAtom,
} from '@einfach/spreadsheet-ui-core'
import { syncFormulaReferenceCaret } from '../provider'
import type { GridLayoutApi } from './grid-layout'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

type GridEditNavigationRuntime = GridRuntimeBase &
  Pick<GridLayoutApi, 'getCell'> &
  Pick<GridViewStateApi, 'selectionSnapshot'>

export function installGridEditNavigation(runtime: GridEditNavigationRuntime) {
  const { props, store, backend, getCell, selectionSnapshot } = runtime

  function startEditingCell(
    row: number,
    col: number,
    source: 'keyboard' | 'cell',
    options?: { initialDraft?: string; clearOnStart?: boolean },
  ) {
    if (store.getter(activeCellLockedAtom)) {
      store.setter(reportLockedEditFeedbackAtom, {
        sheetId: props.sheetId,
        cell: { row, col },
        source,
      })
      return
    }
    const cell = getCell(row, col)
    const existingDraft = cell?.formula ?? cell?.displayValue ?? ''
    const draft =
      options?.clearOnStart === true
        ? (options.initialDraft ?? '')
        : options?.initialDraft !== undefined
          ? `${existingDraft}${options.initialDraft}`
          : existingDraft
    store.setter(clearLockedEditFeedbackForCellAtom, { sheetId: props.sheetId, cell: { row, col } })
    store.setter(startEditingAtom, { sheetId: props.sheetId, cell: { row, col }, draft, source })
    syncFormulaReferenceCaret(store, draft.length)
  }

  function getDataEdgeDirection(key: string): 'up' | 'down' | 'left' | 'right' | null {
    if (key === 'ArrowUp') return 'up'
    if (key === 'ArrowDown') return 'down'
    if (key === 'ArrowLeft') return 'left'
    if (key === 'ArrowRight') return 'right'
    return null
  }

  async function moveSelectionToDataEdge(
    event: KeyboardEvent,
    direction: 'up' | 'down' | 'left' | 'right',
  ): Promise<boolean> {
    const snapshot = selectionSnapshot()
    if (snapshot.selection.sheetId !== props.sheetId) return false
    event.preventDefault()
    const result = await backend.resolveDataEdge!({
      kind: 'resolve-data-edge',
      sheetId: props.sheetId,
      from: { row: snapshot.activeCell.row, col: snapshot.activeCell.col },
      direction,
      bounds: { rowCount: props.viewport.rowCount, colCount: props.viewport.colCount },
    })
    store.setter(selectCellAtom, {
      sheetId: props.sheetId,
      coord: result.target,
      extend: event.shiftKey,
    })
    return true
  }

  return installGridFeature(runtime, {
    startEditingCell,
    getDataEdgeDirection,
    moveSelectionToDataEdge,
  })
}

export type GridEditNavigationApi = ReturnType<typeof installGridEditNavigation>
