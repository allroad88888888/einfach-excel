import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
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
import { createSignal, onCleanup, onMount } from 'solid-js'
import { spreadsheetProjectionSnapshotAtom, useSpreadsheetUiStore } from '../provider'
import { createOverlaySvgGeometry } from './overlay-svg-geometry'
import { OverlaySvgLayers } from './overlay-svg-layers'

export interface SpreadsheetGridOverlaySvgProps {
  sheetId: string
  getCellRect: (row: number, col: number) => { x: number; y: number; w: number; h: number } | null
  getSurfaceSize: () => { width: number; height: number }
  getCells: () => readonly DisplayCell[]
  getFreezeOrigin?: () => { x: number; y: number }
  getVisibleRows?: () => readonly number[]
  getVisibleCols?: () => readonly number[]
}

export function SpreadsheetGridOverlaySvg(props: SpreadsheetGridOverlaySvgProps) {
  const store = useSpreadsheetUiStore()
  const [geometryTick, setGeometryTick] = createSignal(0)
  const [decorationTick, setDecorationTick] = createSignal(0)
  const [size, setSize] = createSignal({ width: 0, height: 0 })
  const geometry = createOverlaySvgGeometry(props, store, geometryTick, decorationTick)
  let svgEl: SVGSVGElement | undefined

  onMount(() => {
    const syncSize = () => {
      const next = props.getSurfaceSize()
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      )
    }
    const bumpGeometry = () => {
      setGeometryTick((tick) => tick + 1)
      syncSize()
    }
    const bumpDecoration = () => {
      setDecorationTick((tick) => tick + 1)
    }
    const unsubscribes = [
      store.sub(selectionRangeAtom, bumpDecoration),
      store.sub(selectionRegionsAtom, bumpDecoration),
      store.sub(activeCellAtom, bumpDecoration),
      store.sub(pointerSessionAtom, bumpDecoration),
      store.sub(clipboardStateAtom, bumpDecoration),
      store.sub(editingSessionAtom, bumpDecoration),
      store.sub(formulaReferenceTokensAtom, bumpDecoration),
      store.sub(activeSpillRegionAtom, bumpDecoration),
      store.sub(viewportMetricsAtom, bumpGeometry),
      store.sub(viewportFreezeAtom, bumpGeometry),
      store.sub(viewportSizeOverridesAtom, bumpGeometry),
      store.sub(viewportHiddenAtom, bumpGeometry),
      store.sub(spreadsheetProjectionSnapshotAtom, bumpGeometry),
    ]
    bumpGeometry()
    bumpDecoration()
    const observer =
      typeof ResizeObserver !== 'undefined' && svgEl?.parentElement
        ? new ResizeObserver(bumpGeometry)
        : null
    if (observer && svgEl?.parentElement) observer.observe(svgEl.parentElement)
    onCleanup(() => {
      observer?.disconnect()
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    })
  })

  return (
    <svg
      ref={svgEl}
      class="spreadsheet-grid-overlay-svg"
      data-testid="grid-overlay-svg"
      aria-hidden="true"
      width={size().width || '100%'}
      height={size().height || '100%'}
      style={{
        position: 'absolute',
        inset: '0',
        'pointer-events': 'none',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
    >
      <OverlaySvgLayers geometry={geometry} />
    </svg>
  )
}
