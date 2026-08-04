import {
  beginProjectionAtom,
  rejectProjectionAtom,
  resetProjectionAtom,
  resolveProjectionAtom,
  viewportMetricsAtom,
  viewportShowHeadingsAtom,
  type CellRange,
  type RangeProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { runVisibleProjectionTransport } from '../provider'
import { GRID_ROW_HEADER_WIDTH } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export function installGridProjectionController(runtime: GridRuntime) {
  const { props, store, backend, bumpRender, getRenderedVisibleWindow, getEffectiveFreezeProjection, hydrateViewportSizeProjection } = runtime
  let lastEffectiveFreezeRows = 0
  let lastEffectiveFreezeCols = 0

  function requestProjection() {
    const window = getRenderedVisibleWindow()
    if (window.rowEnd < window.rowStart || window.colEnd < window.colStart) {
      store.setter(resetProjectionAtom)
      bumpRender()
      return undefined
    }
    const begin = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: props.sheetId, window, reason: 'viewport' })
    if ((begin.status !== 'started' && begin.status !== 'queued') || begin.request.kind !== 'visible-window') return undefined
    bumpRender()
    return begin.status === 'started' ? { request: begin.request } : undefined
  }

  async function loadProjection(requestInfo: ReturnType<typeof requestProjection>) {
    if (!requestInfo) return
    try {
      await runVisibleProjectionTransport(store, backend, requestInfo.request)
    } catch {
      // The shared transport loop publishes terminal projection failures.
    }
    bumpRender()
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

  function syncScrollElementToViewport() {
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (!scrollRoot) return
    const metrics = store.getter(viewportMetricsAtom)
    if (Math.abs(scrollRoot.scrollTop - metrics.scrollTop) > 0.5) scrollRoot.scrollTop = metrics.scrollTop
    if (Math.abs(scrollRoot.scrollLeft - metrics.scrollLeft) > 0.5) scrollRoot.scrollLeft = metrics.scrollLeft
  }

  function syncViewportSizeFromElement() {
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (!scrollRoot) return
    const metrics = store.getter(viewportMetricsAtom)
    const headingWidth = store.getter(viewportShowHeadingsAtom) ? GRID_ROW_HEADER_WIDTH : 0
    const headingHeight = store.getter(viewportShowHeadingsAtom) ? metrics.rowHeight : 0
    const measuredWidth = scrollRoot.clientWidth - headingWidth
    const measuredHeight = scrollRoot.clientHeight - headingHeight
    const viewportWidth = measuredWidth > 0 ? measuredWidth : metrics.viewportWidth
    const viewportHeight = measuredHeight > 0 ? measuredHeight : metrics.viewportHeight
    if (metrics.viewportWidth === viewportWidth && metrics.viewportHeight === viewportHeight) return
    store.setter(viewportMetricsAtom, { ...metrics, viewportWidth, viewportHeight })
  }

  function refreshViewportProjection() {
    syncViewportSizeFromElement()
    syncScrollElementToViewport()
    bumpRender()
    void loadProjection(requestProjection())
    void hydrateViewportSizeProjection()
  }

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
    bumpRender()
    if (changed) void loadProjection(requestProjection())
  }

  function handleViewportScroll(event: Event & { currentTarget: HTMLDivElement }) {
    const target = event.currentTarget
    const metrics = store.getter(viewportMetricsAtom)
    if (metrics.scrollTop === target.scrollTop && metrics.scrollLeft === target.scrollLeft) return
    store.setter(viewportMetricsAtom, { ...metrics, scrollTop: target.scrollTop, scrollLeft: target.scrollLeft })
  }

  Object.assign(runtime, { requestProjection, loadProjection, readRangeProjection, hydrateViewportSizeProjection, syncScrollElementToViewport, syncViewportSizeFromElement, refreshViewportProjection, initializeFreezeProjection, refreshEffectiveFreezeProjection, handleViewportScroll })
}
