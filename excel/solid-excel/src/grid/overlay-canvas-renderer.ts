import {
  activeCellAtom,
  activeSpillRegionAtom,
  clipboardStateAtom,
  editingSessionAtom,
  formulaReferenceTokensAtom,
  pointerSessionAtom,
  selectionRangeAtom,
  selectionRegionsAtom,
  viewportFreezeAtom,
  viewportHiddenAtom,
  viewportMetricsAtom,
  viewportSizeOverridesAtom,
} from '@einfach/spreadsheet-ui-core'
import type { Store } from '@einfach/core'
import { spreadsheetProjectionSnapshotAtom } from '../provider'
import { drawOverlay } from './overlay-canvas-draw'
import type {
  OverlayContext,
  OverlayContextFactory,
  OverlayDirtyReason,
  OverlaySnapshot,
  OverlayViewportProvider,
} from './overlay-types'

export class OverlayRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: OverlayContext | null = null
  private store: Store | null = null
  private viewport: OverlayViewportProvider | null = null
  private dpr = 1
  private cssWidth = 0
  private cssHeight = 0
  private rafHandle: number | null = null
  private marchingAntsHandle: number | null = null
  private marchingAntsOffset = 0
  private dirty = false
  private unsubscribes: Array<() => void> = []
  constructor(private readonly contextFactory: OverlayContextFactory = defaultContextFactory) {}
  attach(canvas: HTMLCanvasElement, store: Store, viewport: OverlayViewportProvider): void {
    this.canvas = canvas
    this.store = store
    this.viewport = viewport
    this.ctx = this.contextFactory(canvas)
    this.subscribeAtoms()
    this.resize()
    this.markDirty('resize')
  }

  detach(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = null
    this.stopMarchingAnts()
    this.unsubscribes.forEach((unsubscribe) => unsubscribe())
    this.unsubscribes = []
    this.canvas = null
    this.ctx = null
    this.store = null
    this.viewport = null
  }

  markDirty(_reason: OverlayDirtyReason): void {
    if (this.dirty) return
    this.dirty = true
    if (this.rafHandle !== null) return
    this.rafHandle = scheduleFrame(() => {
      this.rafHandle = null
      if (!this.dirty) return
      this.dirty = false
      this.render()
    })
  }

  resize(): void {
    if (!this.canvas || !this.viewport) return
    const size = this.viewport.getSurfaceSize()
    this.dpr = readDevicePixelRatio()
    this.cssWidth = Math.max(0, size.width)
    this.cssHeight = Math.max(0, size.height)
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * this.dpr))
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * this.dpr))
    this.canvas.style.width = `${this.cssWidth}px`
    this.canvas.style.height = `${this.cssHeight}px`
  }

  renderNow(): void {
    this.dirty = false
    this.render()
  }

  getMarchingAntsOffset(): number {
    return this.marchingAntsOffset
  }

  private subscribeAtoms(): void {
    if (!this.store) return
    const wake = (reason: OverlayDirtyReason) => () => {
      this.markDirty(reason)
      this.refreshMarchingAnts()
    }
    const subscriptions: Array<[unknown, OverlayDirtyReason]> = [
      [selectionRangeAtom, 'selection'],
      [selectionRegionsAtom, 'selection'],
      [activeCellAtom, 'selection'],
      [pointerSessionAtom, 'pointer'],
      [clipboardStateAtom, 'clipboard'],
      [viewportMetricsAtom, 'metrics'],
      [viewportFreezeAtom, 'viewport'],
      [viewportSizeOverridesAtom, 'metrics'],
      [viewportHiddenAtom, 'viewport'],
      [spreadsheetProjectionSnapshotAtom, 'projection'],
      [editingSessionAtom, 'selection'],
      [formulaReferenceTokensAtom, 'selection'],
      [activeSpillRegionAtom, 'projection'],
    ]
    for (const [atom, reason] of subscriptions)
      this.unsubscribes.push(this.store.sub(atom as never, wake(reason)))
    this.refreshMarchingAnts()
  }

  private refreshMarchingAnts(): void {
    const intent = this.store?.getter(clipboardStateAtom).intent
    const wanted = intent?.type === 'clipboard.copy' || intent?.type === 'clipboard.cut'
    if (wanted && this.marchingAntsHandle === null) this.startMarchingAnts()
    if (!wanted && this.marchingAntsHandle !== null) this.stopMarchingAnts()
  }

  private startMarchingAnts(): void {
    const tick = () => {
      this.marchingAntsOffset = (this.marchingAntsOffset + 1) % 1000
      this.markDirty('marching-ants')
      this.marchingAntsHandle = setTimeout(tick, 120) as unknown as number
    }
    this.marchingAntsHandle = setTimeout(tick, 120) as unknown as number
  }

  private stopMarchingAnts(): void {
    if (this.marchingAntsHandle !== null) clearTimeout(this.marchingAntsHandle)
    this.marchingAntsHandle = null
  }

  private snapshot(): OverlaySnapshot | null {
    if (!this.store || !this.viewport) return null
    const sheetId = this.viewport.getSheetId()
    const freeze = this.store.getter(viewportFreezeAtom)
    const active = this.store.getter(activeCellAtom)
    const editing = this.store.getter(editingSessionAtom)
    return {
      selectionRegions: this.store.getter(selectionRegionsAtom),
      activeCell: { row: active.row, col: active.col, sheetId: active.sheetId ?? sheetId },
      selectionRange: this.store.getter(selectionRangeAtom),
      pointerSession: this.store.getter(pointerSessionAtom),
      clipboard: this.store.getter(clipboardStateAtom),
      freezeRows: freeze.rowsBySheet[sheetId] ?? 0,
      freezeCols: freeze.colsBySheet[sheetId] ?? 0,
      marchingAntsOffset: this.marchingAntsOffset,
      formulaReferenceTokens: this.store.getter(formulaReferenceTokensAtom),
      formulaReferenceSheetId: editing.source?.sheetId ?? null,
      spillRegion: this.store.getter(activeSpillRegionAtom),
    }
  }

  private render(): void {
    if (!this.ctx || !this.viewport) return
    const snapshot = this.snapshot()
    if (!snapshot) return
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
    drawOverlay(this.ctx, this.viewport, snapshot)
  }
}
function defaultContextFactory(canvas: HTMLCanvasElement): OverlayContext | null {
  return canvas.getContext('2d') as unknown as OverlayContext | null
}
function readDevicePixelRatio(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  return typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? dpr : 1
}
function scheduleFrame(callback: () => void): number {
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number)
}
