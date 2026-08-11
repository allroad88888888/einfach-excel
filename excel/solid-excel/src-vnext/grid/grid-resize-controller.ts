import {
  cancelPointerAtom,
  commitPointerAtom,
  setViewportColumnWidthAtom,
  setViewportRowHeightAtom,
  startPointerAtom,
  updatePointerAtom,
} from '@einfach/spreadsheet-ui-core'
import type { GridAutoFitControllerApi } from './grid-auto-fit-controller'
import type { GridLayoutApi } from './grid-layout'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'

type GridResizeControllerRuntime = GridRuntimeBase &
  Pick<GridLayoutApi, 'getRenderedColumnWidth' | 'getRenderedRowHeight'> &
  Pick<GridAutoFitControllerApi, 'persistColumnWidth' | 'persistRowHeight'>

export function installGridResizeController(runtime: GridResizeControllerRuntime) {
  const { props, store, dom, getRenderedColumnWidth, getRenderedRowHeight, persistColumnWidth, persistRowHeight } = runtime

  function startColumnResize(event: PointerEvent, col: number) {
    event.preventDefault(); event.stopPropagation(); dom.cancelResize(); dom.cancelFill()
    const startClientX = event.clientX; const startSize = getRenderedColumnWidth(col); let previewSize = startSize
    store.setter(startPointerAtom, { kind: 'column-resize', sheetId: props.sheetId, colIndex: col, startSizePx: startSize, previewSizePx: startSize, source: 'pointer' })
    const onPointerMove = (moveEvent: PointerEvent) => { previewSize = startSize + moveEvent.clientX - startClientX; store.setter(updatePointerAtom, { kind: 'column-resize', previewSizePx: previewSize }); store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: col, widthPx: previewSize }) }
    const onPointerUp = () => { const intent = store.setter(commitPointerAtom); if (intent?.type === 'pointer.column-resize.commit') { store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: intent.colIndex, widthPx: intent.previewSizePx }); void persistColumnWidth(intent.colIndex, intent.previewSizePx).catch(() => undefined) } cleanup() }
    const cleanup = () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); store.setter(cancelPointerAtom); dom.setCancelResize(() => undefined) }
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp, { once: true }); dom.setCancelResize(cleanup)
  }

  function startRowResize(event: PointerEvent, row: number) {
    event.preventDefault(); event.stopPropagation(); dom.cancelResize(); dom.cancelFill()
    const startClientY = event.clientY; const startSize = getRenderedRowHeight(row); let previewSize = startSize
    store.setter(startPointerAtom, { kind: 'row-resize', sheetId: props.sheetId, rowIndex: row, startSizePx: startSize, previewSizePx: startSize, source: 'pointer' })
    const onPointerMove = (moveEvent: PointerEvent) => { previewSize = startSize + moveEvent.clientY - startClientY; store.setter(updatePointerAtom, { kind: 'row-resize', previewSizePx: previewSize }); store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: row, heightPx: previewSize }) }
    const onPointerUp = () => { const intent = store.setter(commitPointerAtom); if (intent?.type === 'pointer.row-resize.commit') { store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: intent.rowIndex, heightPx: intent.previewSizePx }); void persistRowHeight(intent.rowIndex, intent.previewSizePx).catch(() => undefined) } cleanup() }
    const cleanup = () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); store.setter(cancelPointerAtom); dom.setCancelResize(() => undefined) }
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp, { once: true }); dom.setCancelResize(cleanup)
  }

  return installGridFeature(runtime, { startColumnResize, startRowResize })
}

export type GridResizeControllerApi = ReturnType<typeof installGridResizeController>
