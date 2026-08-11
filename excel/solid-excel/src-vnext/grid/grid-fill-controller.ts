import {
  addSelectionRegionAtom,
  cancelPointerAtom,
  runAutoFillAtom,
  selectColumnsAtom,
  selectRowsAtom,
  type AutoFillControllerPort,
  type PointerFillHandleCommitIntent,
  type RunAutoFillInput,
} from '@einfach/spreadsheet-ui-core'
import { reportCommandFailure } from '../provider'
import type { GridContextMenuApi } from './grid-context-menu'
import type { GridProjectionControllerApi } from './grid-projection-controller'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

type GridFillControllerRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'selectionSnapshot' | 'viewportMetrics'> &
  Pick<
    GridProjectionControllerApi,
    'readRangeProjection' | 'requestProjection' | 'loadProjection'
  > &
  Pick<GridContextMenuApi, 'focusGrid'>

export function installGridFillController(runtime: GridFillControllerRuntime) {
  const {
    props,
    store,
    backend,
    dom,
    selectionSnapshot,
    viewportMetrics,
    readRangeProjection,
    requestProjection,
    loadProjection,
    focusGrid,
  } = runtime

  function createAutoFillController(): AutoFillControllerPort {
    return {
      readRangeProjection: (sheetId, range) =>
        readRangeProjection(sheetId, { ...range }, 'fill-handle'),
      setCellInput: (request) => backend.setCellInput(request),
      ...(backend.fillSeries
        ? {
            fillSeries: (request: Parameters<NonNullable<typeof backend.fillSeries>>[0]) =>
              backend.fillSeries!(request),
          }
        : {}),
      ...(backend.fillRange
        ? {
            fillRange: (request: Parameters<NonNullable<typeof backend.fillRange>>[0]) =>
              backend.fillRange!(request),
          }
        : {}),
      ...(backend.importCells
        ? {
            importCells: (request: Parameters<NonNullable<typeof backend.importCells>>[0]) =>
              backend.importCells!(request),
          }
        : {}),
      ...(backend.resolveDataEdge
        ? {
            resolveDataEdge: (
              request: Parameters<NonNullable<typeof backend.resolveDataEdge>>[0],
            ) => backend.resolveDataEdge!(request),
          }
        : {}),
    }
  }

  async function dispatchAutoFill(input: RunAutoFillInput) {
    try {
      return await store.setter(runAutoFillAtom, input)
    } catch (error) {
      reportCommandFailure(store, error, 'Filling cells failed.')
      return null
    }
  }

  async function executeFillHandle(intent: PointerFillHandleCommitIntent) {
    if (intent.direction === null) return
    await dispatchAutoFill({
      entrypoint: 'fill-handle',
      intent: {
        sheetId: intent.sheetId,
        sourceRange: { ...intent.sourceRange },
        targetRange: { ...intent.targetRange },
        direction: intent.direction,
        copyOnly: intent.copyOnly,
      },
      source: createAutoFillController(),
      refreshProjection: async () => loadProjection(requestProjection()),
    })
  }

  async function executeFillHandleDoubleClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    dom.cancelDragSelection()
    dom.cancelFill()
    dom.cancelResize()
    store.setter(cancelPointerAtom)
    const snapshot = selectionSnapshot()
    if (snapshot.selection.sheetId !== props.sheetId) return
    const metrics = viewportMetrics()
    await dispatchAutoFill({
      entrypoint: 'double-click',
      sheetId: props.sheetId,
      sourceRange: { ...snapshot.range },
      bounds: { rowCount: metrics.rowCount, colCount: metrics.colCount },
      source: createAutoFillController(),
      refreshProjection: async () => loadProjection(requestProjection()),
    })
  }

  function selectRow(row: number, extend: boolean, append: boolean) {
    if (append) {
      store.setter(addSelectionRegionAtom, {
        region: { kind: 'row', sheetId: props.sheetId, rowAnchor: row, rowFocus: row },
      })
      focusGrid()
      return
    }
    const selection = selectionSnapshot().selection
    const rowAnchor =
      extend && selection.sheetId === props.sheetId && selection.kind === 'row'
        ? selection.rowAnchor
        : row
    store.setter(selectRowsAtom, { sheetId: props.sheetId, rowAnchor, rowFocus: row })
    focusGrid()
  }

  function selectColumn(col: number, extend: boolean, append: boolean) {
    if (append) {
      store.setter(addSelectionRegionAtom, {
        region: { kind: 'column', sheetId: props.sheetId, colAnchor: col, colFocus: col },
      })
      focusGrid()
      return
    }
    const selection = selectionSnapshot().selection
    const colAnchor =
      extend && selection.sheetId === props.sheetId && selection.kind === 'column'
        ? selection.colAnchor
        : col
    store.setter(selectColumnsAtom, { sheetId: props.sheetId, colAnchor, colFocus: col })
    focusGrid()
  }

  return installGridFeature(runtime, {
    createAutoFillController,
    executeFillHandle,
    executeFillHandleDoubleClick,
    selectRow,
    selectColumn,
  })
}

export type GridFillControllerApi = ReturnType<typeof installGridFillController>
