import {
  beginProjectionAtom,
  getAxisOffsetForIndex,
  getAxisStartIndexAtOffset,
  needsReanchor,
  planSnappedScrollPlacement,
  rejectProjectionAtom,
  resetProjectionAtom,
  resolveProjectionAtom,
  viewportMetricsAtom,
  type AxisScrollGeometry, type CellRange, type RangeProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { createEffect, untrack } from 'solid-js'
import { runVisibleProjectionTransport, spreadsheetProjectionSnapshotAtom } from '../provider'
import { GRID_ROW_HEADER_WIDTH } from './grid-constants'
import type { GridLayoutApi } from './grid-layout'
import { installGridFeature, type GridHydrationApi, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

interface GridScrollStats {
  scrollEvents: number
  reanchors: number
  windowChanges: number
  lastWindowRenderMs: number
}

declare global {
  interface Window {
    __scrollStats?: GridScrollStats
  }
}

/** URL 带 ?scrollDebug=1 时在 window.__scrollStats 上暴露滚动诊断计数器。 */
function createScrollStats() {
  if (typeof window === 'undefined') return null
  try {
    if (new URLSearchParams(window.location.search).get('scrollDebug') !== '1') return null
  } catch {
    return null
  }
  const stats: GridScrollStats = { scrollEvents: 0, reanchors: 0, windowChanges: 0,
    lastWindowRenderMs: 0 }
  window.__scrollStats = stats
  return stats
}
type GridProjectionRuntime = GridRuntimeBase & GridHydrationApi &
  Pick<GridViewStateApi, 'getRenderedVisibleWindow' | 'getEffectiveFreezeProjection'> &
  Pick<GridLayoutApi,
    'getRowOverridesForSheet' | 'getColOverridesForSheet' | 'getTotalRowSpanPx' |
    'getRowScrollSurfacePx' | 'getTotalColSpanPx' | 'getColScrollSurfacePx'
  > &
  Pick<GridViewStateApi, 'getHiddenRowSet' | 'getHiddenColSet'>
export function installGridProjectionController(runtime: GridProjectionRuntime) {
  const { props, store, backend, atoms, dom, getRenderedVisibleWindow, getEffectiveFreezeProjection,
    hydrateViewportSizeProjection } = runtime
  const scrollStats = createScrollStats()
  let lastEffectiveFreezeRows = 0
  let lastEffectiveFreezeCols = 0

  function requestProjection() {
    const window = getRenderedVisibleWindow()
    if (window.rowEnd < window.rowStart || window.colEnd < window.colStart) {
      store.setter(resetProjectionAtom)
      return undefined
    }
    // 滚动时保留上一窗口的 result：不保留的话 begin 会把快照清成 undefined，
    // 所有已渲染的格子瞬间变空、等 RPC 回包才恢复。只在同 sheet 时保留，
    // 避免切表瞬间闪上一张表的旧数据。
    const retainResult =
      store.getter(spreadsheetProjectionSnapshotAtom).result?.sheetId === props.sheetId
    const begin = store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId: props.sheetId,
      window,
      reason: 'viewport',
      retainResult,
    })
    if ((begin.status !== 'started' && begin.status !== 'queued') || begin.request.kind !== 'visible-window') return undefined
    return begin.status === 'started' ? { request: begin.request } : undefined
  }

  async function loadProjection(requestInfo: ReturnType<typeof requestProjection>) {
    if (!requestInfo) return
    try {
      await runVisibleProjectionTransport(store, backend, requestInfo.request)
    } catch {
      // The shared transport loop publishes terminal projection failures.
    }
  }

  async function readRangeProjection(sheetId: string, range: CellRange, reason: 'clipboard' | 'fill-handle'): Promise<RangeProjectionResult | null> {
    const begin = store.setter(beginProjectionAtom, { kind: 'range', sheetId, range, reason })
    if (begin.status !== 'started' || begin.request.kind !== 'range') return null
    const request = begin.request
    try {
      const result = await backend.readRangeProjection(request)
      const outcome = store.setter(resolveProjectionAtom, { request, result })
      return outcome.status === 'accepted' && outcome.result.kind === 'range' ? outcome.result : null
    } catch (error) {
      store.setter(rejectProjectionAtom, { request, error })
      throw error
    }
  }

  /** 锚点对齐到行/列边界。渲染窗口从锚点起画，锚点若落在行中间，spacer 取整
   * 会把内容顶出亚行高的偏差，重锚瞬间就能看见一次小跳 —— 对齐后恒为零。 */
  function snapAnchorPx(axis: 'row' | 'col', anchorPx: number): number {
    const metrics = store.getter(viewportMetricsAtom)
    if (axis === 'row') {
      const overrides = runtime.getRowOverridesForSheet()
      const hidden = runtime.getHiddenRowSet()
      const index = getAxisStartIndexAtOffset(
        anchorPx, metrics.rowCount, metrics.rowHeight, overrides, hidden,
      )
      return getAxisOffsetForIndex(index, metrics.rowCount, metrics.rowHeight, overrides, hidden)
    }
    const overrides = runtime.getColOverridesForSheet()
    const hidden = runtime.getHiddenColSet()
    const index = getAxisStartIndexAtOffset(
      anchorPx, metrics.colCount, metrics.colWidth, overrides, hidden,
    )
    return getAxisOffsetForIndex(index, metrics.colCount, metrics.colWidth, overrides, hidden)
  }

  function getAxisScrollGeometry(axis: 'row' | 'col'): AxisScrollGeometry {
    const metrics = store.getter(viewportMetricsAtom)
    if (axis === 'row') {
      return {
        totalPx: runtime.getTotalRowSpanPx(),
        viewportPx: metrics.viewportHeight,
        surfacePx: runtime.getRowScrollSurfacePx(),
      }
    }
    return {
      totalPx: runtime.getTotalColSpanPx(),
      viewportPx: metrics.viewportWidth,
      surfacePx: runtime.getColScrollSurfacePx(),
    }
  }

  /** 把 DOM 滚动位置对齐到 atom 里的逻辑位置（跳转、名称框、键盘导航都走这里）。
   * 已对齐（anchor + physical === logical）时不动 —— 否则会跟正在进行的滚动打架。 */
  function syncScrollElementToViewport(realignAnchor = false) {
    const scrollRoot = dom.scrollRoot()
    if (!scrollRoot) return
    const metrics = store.getter(viewportMetricsAtom)
    const rowLogicalPx = dom.rowAnchorPx() + scrollRoot.scrollTop
    const colLogicalPx = dom.colAnchorPx() + scrollRoot.scrollLeft
    const rowDrifted = Math.abs(rowLogicalPx - metrics.scrollTop) > 0.5
    const colDrifted = Math.abs(colLogicalPx - metrics.scrollLeft) > 0.5
    if (!realignAnchor && !rowDrifted && !colDrifted) return
    const rowPlacement = rowDrifted || realignAnchor
      ? planSnappedScrollPlacement(
        metrics.scrollTop,
        getAxisScrollGeometry('row'),
        (anchorPx) => snapAnchorPx('row', anchorPx),
      )
      : null
    const colPlacement = colDrifted || realignAnchor
      ? planSnappedScrollPlacement(
        metrics.scrollLeft,
        getAxisScrollGeometry('col'),
        (anchorPx) => snapAnchorPx('col', anchorPx),
      )
      : null
    // spacer 高度先于 scrollTop 落地（同一帧内），内容才不跳。
    if (rowPlacement) {
      dom.setRowAnchorPx(rowPlacement.anchorPx)
      scrollRoot.scrollTop = rowPlacement.physicalPx
    }
    if (colPlacement) {
      dom.setColAnchorPx(colPlacement.anchorPx)
      scrollRoot.scrollLeft = colPlacement.physicalPx
    }
    const scrollTop = rowPlacement
      ? rowPlacement.anchorPx + rowPlacement.physicalPx : metrics.scrollTop
    const scrollLeft = colPlacement
      ? colPlacement.anchorPx + colPlacement.physicalPx : metrics.scrollLeft
    if (scrollTop !== metrics.scrollTop || scrollLeft !== metrics.scrollLeft) {
      store.setter(viewportMetricsAtom, { ...metrics, scrollTop, scrollLeft })
    }
  }

  function syncViewportSizeFromElement() {
    const scrollRoot = dom.scrollRoot()
    if (!scrollRoot) return
    const metrics = atoms.viewportMetrics()
    const headingWidth = atoms.showHeadings() ? GRID_ROW_HEADER_WIDTH : 0
    const headingHeight = atoms.showHeadings() ? metrics.rowHeight : 0
    const measuredWidth = scrollRoot.clientWidth - headingWidth
    const measuredHeight = scrollRoot.clientHeight - headingHeight
    const viewportWidth = measuredWidth > 0 ? measuredWidth : metrics.viewportWidth
    const viewportHeight = measuredHeight > 0 ? measuredHeight : metrics.viewportHeight
    if (metrics.viewportWidth === viewportWidth && metrics.viewportHeight === viewportHeight) return
    store.setter(viewportMetricsAtom, { ...metrics, viewportWidth, viewportHeight })
  }

  let lastViewportWindowKey = ''

  function refreshViewportProjection() {
    // 尺寸读取（clientWidth/Height 强制 layout）不进滚动热路径：挂载与
    // ResizeObserver 已覆盖（grid-lifecycle.ts），这里只消费已知 metrics。
    syncScrollElementToViewport()
    // 渲染窗口 = 滚动表面（grid-view-state.ts），表面内滚动时窗口不变 ——
    // 此时既不重渲染也不发 RPC：行列 DOM 静止靠原生滚动位移，选区 overlay
    // 的 canvas 自己订阅 viewportMetricsAtom 跟进。窗口真变（重锚/跳转/
    // resize）才走完整管线。内容变更走 subscribeContentChanges，freeze 变更
    // 走 refreshEffectiveFreezeProjection，都直接调 requestProjection，
    // 不受这道闸门影响。
    const window = getRenderedVisibleWindow()
    const key = `${props.sheetId}|${window.rowStart}|${window.rowEnd}|${window.colStart}|${window.colEnd}`
    if (key === lastViewportWindowKey) return
    lastViewportWindowKey = key
    if (scrollStats) {
      scrollStats.windowChanges += 1
      const startedAt = performance.now()
      scrollStats.lastWindowRenderMs = Math.round(performance.now() - startedAt)
    }
    void loadProjection(requestProjection())
    void hydrateViewportSizeProjection()
  }

  // Async size/hidden facts alter geometry without updating metrics; restore anchor and projection.
  createEffect(() => {
    const geometryFacts = [
      props.sheetId,
      atoms.sizeOverrides(),
      atoms.hiddenState(),
      atoms.viewportHidden(),
    ]
    untrack(() => {
      syncScrollElementToViewport(true)
      refreshViewportProjection()
    })
    return geometryFacts
  })

  function initializeFreezeProjection() {
    const initialFreeze = getEffectiveFreezeProjection()
    lastEffectiveFreezeRows = initialFreeze.rows
    lastEffectiveFreezeCols = initialFreeze.cols
  }

  function refreshEffectiveFreezeProjection() {
    const next = getEffectiveFreezeProjection()
    const changed = next.rows !== lastEffectiveFreezeRows || next.cols !== lastEffectiveFreezeCols
    lastEffectiveFreezeRows = next.rows
    lastEffectiveFreezeCols = next.cols
    if (changed) void loadProjection(requestProjection())
  }

  /** 触边重锚必须在 scroll 事件里同步做（只是几个赋值）：拖到 rAF 的话，
   * 惯性滚动的单帧大增量会先被浏览器 clamp 在表面边缘，超出的像素被吞掉。 */
  function reanchorAxis(axis: 'row' | 'col', element: HTMLDivElement): number | null {
    const geometry = getAxisScrollGeometry(axis)
    const physicalPx = axis === 'row' ? element.scrollTop : element.scrollLeft
    const anchorPx = axis === 'row' ? dom.rowAnchorPx() : dom.colAnchorPx()
    if (!needsReanchor(physicalPx, anchorPx, geometry)) return null
    const logicalPx = anchorPx + physicalPx
    const placement = planSnappedScrollPlacement(
      logicalPx, geometry, (nextAnchorPx) => snapAnchorPx(axis, nextAnchorPx),
    )
    if (placement.anchorPx === anchorPx) return null
    if (axis === 'row') dom.setRowAnchorPx(placement.anchorPx)
    else dom.setColAnchorPx(placement.anchorPx)
    return placement.physicalPx
  }

  function handleViewportScroll(event: Event & { currentTarget: HTMLDivElement }) {
    const target = event.currentTarget
    if (scrollStats) scrollStats.scrollEvents += 1
    const rowPhysicalPx = reanchorAxis('row', target)
    const colPhysicalPx = reanchorAxis('col', target)
    if (rowPhysicalPx !== null || colPhysicalPx !== null) {
      if (scrollStats) scrollStats.reanchors += 1
      // spacer 高度先于 scrollTop 落地（同一帧内），内容才不跳。
      if (rowPhysicalPx !== null) target.scrollTop = rowPhysicalPx
      if (colPhysicalPx !== null) target.scrollLeft = colPhysicalPx
    }
    const metrics = atoms.viewportMetrics()
    const scrollTop = dom.rowAnchorPx() + target.scrollTop
    const scrollLeft = dom.colAnchorPx() + target.scrollLeft
    if (metrics.scrollTop === scrollTop && metrics.scrollLeft === scrollLeft) return
    store.setter(viewportMetricsAtom, { ...metrics, scrollTop, scrollLeft })
  }

  return installGridFeature(runtime, {
    requestProjection,
    loadProjection,
    readRangeProjection,
    syncScrollElementToViewport,
    syncViewportSizeFromElement,
    refreshViewportProjection,
    initializeFreezeProjection,
    refreshEffectiveFreezeProjection,
    handleViewportScroll,
  })
}

export type GridProjectionControllerApi = ReturnType<typeof installGridProjectionController>
