import {
  getHiddenColumnsForSheet,
  getHiddenRowsForSheet,
  refreshSpillRegionAtom,
  spillRegionSupportedAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import {
  getAxisEndIndexAtOffset,
  getAxisStartIndexAtOffset,
} from './axis-geometry'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridScrollSurfacePort } from './grid-runtime-ports'

export function installGridViewState(runtime: GridRuntimeBase & GridScrollSurfacePort) {
  const { props, store, backend, atoms, dom } = runtime
  let lastSpillProbeKey = ''

  function refreshSpillRegion() {
    if (!store.getter(spillRegionSupportedAtom)) return
    const active = atoms.selectionSnapshot().activeCell
    const sheetId = active.sheetId || props.sheetId
    const revision = atoms.projectionSnapshot().result?.revision
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

  function visibleWindow() {
    return getRenderedVisibleWindow()
  }

  function viewportMetrics() {
    return atoms.viewportMetrics()
  }

  function projectionSnapshot() {
    return atoms.projectionSnapshot()
  }

  function selectionSnapshot() {
    return atoms.selectionSnapshot()
  }

  function selectionRegions() {
    return atoms.selectionRegions()
  }

  function editingSession() {
    return atoms.editingSession()
  }

  function editingDraft() {
    return atoms.editingDraft()
  }

  function sizeOverrides() {
    return atoms.sizeOverrides()
  }

  function getEffectiveFreezeProjection() {
    const freezeState = atoms.viewportFreeze()
    return {
      rows: freezeState.rowsBySheet[props.sheetId] ?? 0,
      cols: freezeState.colsBySheet[props.sheetId] ?? 0,
    }
  }

  function getHiddenRowSet(): ReadonlySet<number> {
    return new Set(getHiddenRowsForSheet(atoms.hiddenState(), props.sheetId))
  }

  function getHiddenColSet(): ReadonlySet<number> {
    return new Set(getHiddenColumnsForSheet(atoms.viewportHidden(), props.sheetId))
  }

  // 渲染/投影窗口按滚动**表面**取（锚点 → 锚点+表面跨度，见 grid/scroll-anchor.ts），
  // 不是可视区 ±overscan：表面内滚动时窗口不变 —— 行列 DOM 静止、零 RPC、
  // 零重渲染，只有重锚/跳转才换窗口。表面 = min(整表, 5×视口)，行列各 ≤ 一两百个
  // 索引，远低于投影上限。freeze 轴保持旧口径（窗口钉在原点、随滚动扩到可视区尾）。
  function getRenderedVisibleWindow(): CellRange {
    const metrics = atoms.viewportMetrics()
    const overrides = atoms.sizeOverrides()
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
      const anchorPx = dom.rowAnchorPx()
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
      const anchorPx = dom.colAnchorPx()
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
    return atoms.hiddenState()
  }

  return installGridFeature(runtime, {
    refreshSpillRegion,
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

export type GridViewStateApi = ReturnType<typeof installGridViewState>
