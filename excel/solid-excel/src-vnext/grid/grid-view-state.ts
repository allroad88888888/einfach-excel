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

  // 渲染/投影窗口按滚动**表面**取（锚点 → 锚点+表面跨度，见 grid/scroll-anchor.ts），
  // 不是可视区 ±overscan：表面内滚动时窗口不变 —— 行列 DOM 静止、零 RPC、
  // 零重渲染，只有重锚/跳转才换窗口。表面 = min(整表, 5×视口)，行列各 ≤ 一两百个
  // 索引，远低于投影上限。freeze 轴保持旧口径（窗口钉在原点、随滚动扩到可视区尾）。
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

    const freeze = getEffectiveFreezeProjection()

    let rowStart: number
    let rowEnd: number
    if (freeze.rows > 0) {
      rowStart = 0
      const rawRowEnd = metrics.viewportHeight <= 0
        ? getAxisStartIndexAtOffset(
            metrics.scrollTop, metrics.rowCount, metrics.rowHeight, rowOverrides, hiddenRows,
          )
        : getAxisEndIndexAtOffset(
            metrics.scrollTop + metrics.viewportHeight,
            metrics.rowCount, metrics.rowHeight, rowOverrides, hiddenRows,
          )
      rowEnd = Math.min(metrics.rowCount - 1, rawRowEnd + metrics.overscanRows)
    } else {
      const anchorPx = runtime.rowAnchorPx as number
      const surfacePx = runtime.getRowScrollSurfacePx()
      rowStart = getAxisStartIndexAtOffset(
        anchorPx, metrics.rowCount, metrics.rowHeight, rowOverrides, hiddenRows,
      )
      rowEnd = Math.min(
        metrics.rowCount - 1,
        getAxisEndIndexAtOffset(
          anchorPx + surfacePx, metrics.rowCount, metrics.rowHeight, rowOverrides, hiddenRows,
        ),
      )
    }

    let colStart: number
    let colEnd: number
    if (freeze.cols > 0) {
      colStart = 0
      const rawColEnd = metrics.viewportWidth <= 0
        ? getAxisStartIndexAtOffset(
            metrics.scrollLeft, metrics.colCount, metrics.colWidth, colOverrides, hiddenCols,
          )
        : getAxisEndIndexAtOffset(
            metrics.scrollLeft + metrics.viewportWidth,
            metrics.colCount, metrics.colWidth, colOverrides, hiddenCols,
          )
      colEnd = Math.min(metrics.colCount - 1, rawColEnd + metrics.overscanCols)
    } else {
      const anchorPx = runtime.colAnchorPx as number
      const surfacePx = runtime.getColScrollSurfacePx()
      colStart = getAxisStartIndexAtOffset(
        anchorPx, metrics.colCount, metrics.colWidth, colOverrides, hiddenCols,
      )
      colEnd = Math.min(
        metrics.colCount - 1,
        getAxisEndIndexAtOffset(
          anchorPx + surfacePx, metrics.colCount, metrics.colWidth, colOverrides, hiddenCols,
        ),
      )
    }

    return { rowStart, rowEnd, colStart, colEnd }
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
