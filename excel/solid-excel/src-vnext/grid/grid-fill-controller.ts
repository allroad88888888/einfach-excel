import {
  addSelectionRegionAtom,
  cancelPointerAtom,
  runAutoFillAtom,
  selectColumnsAtom,
  selectRowsAtom,
  type AutoFillControllerPort,
  type PointerFillHandleCommitIntent,
} from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

export function installGridFillController(runtime: GridRuntime) {
  const { props, store, backend, selectionSnapshot, viewportMetrics, readRangeProjection, requestProjection, loadProjection, bumpRender, focusGrid } = runtime

  function createAutoFillController(): AutoFillControllerPort {
    return {
      readRangeProjection: (sheetId, range) => readRangeProjection(sheetId, { ...range }, 'fill-handle'),
      setCellInput: (request) => backend.setCellInput(request),
      ...(backend.fillSeries ? { fillSeries: (request: Parameters<NonNullable<typeof backend.fillSeries>>[0]) => backend.fillSeries!(request) } : {}),
      ...(backend.fillRange ? { fillRange: (request: Parameters<NonNullable<typeof backend.fillRange>>[0]) => backend.fillRange!(request) } : {}),
      ...(backend.importCells ? { importCells: (request: Parameters<NonNullable<typeof backend.importCells>>[0]) => backend.importCells!(request) } : {}),
      ...(backend.resolveDataEdge ? { resolveDataEdge: (request: Parameters<NonNullable<typeof backend.resolveDataEdge>>[0]) => backend.resolveDataEdge!(request) } : {}),
    }
  }

  async function executeFillHandle(intent: PointerFillHandleCommitIntent) {
    if (intent.direction === null) return
    await store.setter(runAutoFillAtom, {
      entrypoint: 'fill-handle',
      intent: { sheetId: intent.sheetId, sourceRange: { ...intent.sourceRange }, targetRange: { ...intent.targetRange }, direction: intent.direction, copyOnly: intent.copyOnly },
      source: createAutoFillController(),
      refreshProjection: async () => loadProjection(requestProjection()),
    })
    bumpRender()
  }

  async function executeFillHandleDoubleClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    runtime.cancelFill()
    store.setter(cancelPointerAtom)
    const snapshot = selectionSnapshot()
    if (snapshot.selection.sheetId !== props.sheetId) return
    const metrics = viewportMetrics()
    await store.setter(runAutoFillAtom, {
      entrypoint: 'double-click', sheetId: props.sheetId, sourceRange: { ...snapshot.range },
      bounds: { rowCount: metrics.rowCount, colCount: metrics.colCount }, source: createAutoFillController(),
      refreshProjection: async () => loadProjection(requestProjection()),
    })
    bumpRender()
  }

  function selectRow(row: number, extend: boolean, append: boolean) {
    if (append) {
      store.setter(addSelectionRegionAtom, { region: { kind: 'row', sheetId: props.sheetId, rowAnchor: row, rowFocus: row } })
      bumpRender()
      focusGrid()
      return
    }
    const selection = selectionSnapshot().selection
    const rowAnchor = extend && selection.sheetId === props.sheetId && selection.kind === 'row' ? selection.rowAnchor : row
    store.setter(selectRowsAtom, { sheetId: props.sheetId, rowAnchor, rowFocus: row })
    bumpRender()
    focusGrid()
  }

  function selectColumn(col: number, extend: boolean, append: boolean) {
    if (append) {
      store.setter(addSelectionRegionAtom, { region: { kind: 'column', sheetId: props.sheetId, colAnchor: col, colFocus: col } })
      bumpRender()
      focusGrid()
      return
    }
    const selection = selectionSnapshot().selection
    const colAnchor = extend && selection.sheetId === props.sheetId && selection.kind === 'column' ? selection.colAnchor : col
    store.setter(selectColumnsAtom, { sheetId: props.sheetId, colAnchor, colFocus: col })
    bumpRender()
    focusGrid()
  }

  Object.assign(runtime, { createAutoFillController, executeFillHandle, executeFillHandleDoubleClick, selectRow, selectColumn })
}
