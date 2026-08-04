import { createSignal } from 'solid-js'
import {
  editingDraftAtom,
  editingSessionAtom,
  effectiveHiddenAtom,
  getHiddenColumnsForSheet,
  getHiddenRowsForSheet,
  refreshSpillRegionAtom,
  selectionRegionsAtom,
  selectionSnapshotAtom,
  spillRegionSupportedAtom,
  viewportFreezeAtom,
  viewportHiddenAtom,
  viewportMetricsAtom,
  viewportSizeOverridesAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import { spreadsheetProjectionSnapshotAtom } from '../provider'
import {
  getAxisEndIndexAtOffset,
  getAxisStartIndexAtOffset,
} from './axis-geometry'
import { type GridRuntime } from './grid-runtime'

export function installGridViewState(runtime: GridRuntime) {
  const { props, store, backend } = runtime
  const [renderTick, setRenderTick] = createSignal(0)
  let lastSpillProbeKey = ''

  function bumpRender() {
    setRenderTick((value) => value + 1)
  }

  function refreshSpillRegion() {
    if (!store.getter(spillRegionSupportedAtom)) return
    const active = store.getter(selectionSnapshotAtom).activeCell
    const sheetId = active.sheetId || props.sheetId
    const revision = store.getter(spreadsheetProjectionSnapshotAtom).result?.revision
    const key = `${sheetId}|${active.row}|${active.col}|${String(revision ?? '')}`
    if (key === lastSpillProbeKey) return
    lastSpillProbeKey = key
    void store.setter(refreshSpillRegionAtom, {
      source: backend,
      sheetId,
      cell: { row: active.row, col: active.col },
      revision,
    })
  }

  function bumpRenderAndProbeSpill() {
    bumpRender()
    refreshSpillRegion()
  }

  function visibleWindow() {
    renderTick()
    return getRenderedVisibleWindow()
  }

  function viewportMetrics() {
    renderTick()
    return store.getter(viewportMetricsAtom)
  }

  function projectionSnapshot() {
    renderTick()
    return store.getter(spreadsheetProjectionSnapshotAtom)
  }

  function selectionSnapshot() {
    renderTick()
    return store.getter(selectionSnapshotAtom)
  }

  function selectionRegions() {
    renderTick()
    return store.getter(selectionRegionsAtom)
  }

  function editingSession() {
    renderTick()
    return store.getter(editingSessionAtom)
  }

  function editingDraft() {
    renderTick()
    return store.getter(editingDraftAtom)
  }

  function sizeOverrides() {
    renderTick()
    return store.getter(viewportSizeOverridesAtom)
  }

  function getEffectiveFreezeProjection() {
    const freezeState = store.getter(viewportFreezeAtom)
    return {
      rows: freezeState.rowsBySheet[props.sheetId] ?? 0,
      cols: freezeState.colsBySheet[props.sheetId] ?? 0,
    }
  }

  function getHiddenRowSet(): ReadonlySet<number> {
    return new Set(getHiddenRowsForSheet(store.getter(effectiveHiddenAtom), props.sheetId))
  }

  function getHiddenColSet(): ReadonlySet<number> {
    return new Set(getHiddenColumnsForSheet(store.getter(viewportHiddenAtom), props.sheetId))
  }

  function getRenderedVisibleWindow(): CellRange {
    const metrics = store.getter(viewportMetricsAtom)
    const overrides = store.getter(viewportSizeOverridesAtom)
    const rowOverrides = overrides.rowHeightsBySheet[props.sheetId]
    const colOverrides = overrides.colWidthsBySheet[props.sheetId]
    const hiddenRows = getHiddenRowSet()
    const hiddenCols = getHiddenColSet()

    if (metrics.rowCount === 0 || metrics.colCount === 0) {
      return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }
    }

    const rawRowStart = getAxisStartIndexAtOffset(
      metrics.scrollTop,
      metrics.rowCount,
      metrics.rowHeight,
      rowOverrides,
      hiddenRows,
    )
    const rawColStart = getAxisStartIndexAtOffset(
      metrics.scrollLeft,
      metrics.colCount,
      metrics.colWidth,
      colOverrides,
      hiddenCols,
    )
    const rawRowEnd = metrics.viewportHeight <= 0
      ? rawRowStart
      : getAxisEndIndexAtOffset(
          metrics.scrollTop + metrics.viewportHeight,
          metrics.rowCount,
          metrics.rowHeight,
          rowOverrides,
          hiddenRows,
        )
    const rawColEnd = metrics.viewportWidth <= 0
      ? rawColStart
      : getAxisEndIndexAtOffset(
          metrics.scrollLeft + metrics.viewportWidth,
          metrics.colCount,
          metrics.colWidth,
          colOverrides,
          hiddenCols,
        )
    const freeze = getEffectiveFreezeProjection()

    return {
      rowStart: freeze.rows > 0 ? 0 : Math.max(0, rawRowStart - metrics.overscanRows),
      rowEnd: Math.min(metrics.rowCount - 1, rawRowEnd + metrics.overscanRows),
      colStart: freeze.cols > 0 ? 0 : Math.max(0, rawColStart - metrics.overscanCols),
      colEnd: Math.min(metrics.colCount - 1, rawColEnd + metrics.overscanCols),
    }
  }

  function hiddenState() {
    renderTick()
    return store.getter(effectiveHiddenAtom)
  }

  Object.assign(runtime, {
    renderTick,
    bumpRender,
    refreshSpillRegion,
    bumpRenderAndProbeSpill,
    visibleWindow,
    viewportMetrics,
    projectionSnapshot,
    selectionSnapshot,
    selectionRegions,
    editingSession,
    editingDraft,
    sizeOverrides,
    getEffectiveFreezeProjection,
    getHiddenRowSet,
    getHiddenColSet,
    getRenderedVisibleWindow,
    hiddenState,
  })
}
