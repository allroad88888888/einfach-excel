import {
  cancelPointerAtom,
  commitPointerAtom,
  setViewportColumnWidthAtom,
  setViewportRowHeightAtom,
  startPointerAtom,
  updatePointerAtom,
} from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

export function installGridResizeController(runtime: GridRuntime) {
  const { props, store, getRenderedColumnWidth, getRenderedRowHeight, persistColumnWidth, persistRowHeight, bumpRender } = runtime

  function startColumnResize(event: PointerEvent, col: number) {
    event.preventDefault(); event.stopPropagation(); runtime.cancelResize(); runtime.cancelFill()
    const startClientX = event.clientX; const startSize = getRenderedColumnWidth(col); let previewSize = startSize
    store.setter(startPointerAtom, { kind: 'column-resize', sheetId: props.sheetId, colIndex: col, startSizePx: startSize, previewSizePx: startSize, source: 'pointer' })
    const onPointerMove = (moveEvent: PointerEvent) => { previewSize = startSize + moveEvent.clientX - startClientX; store.setter(updatePointerAtom, { kind: 'column-resize', previewSizePx: previewSize }); store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: col, widthPx: previewSize }); bumpRender() }
    const onPointerUp = () => { const intent = store.setter(commitPointerAtom); if (intent?.type === 'pointer.column-resize.commit') { store.setter(setViewportColumnWidthAtom, { sheetId: props.sheetId, colIndex: intent.colIndex, widthPx: intent.previewSizePx }); void persistColumnWidth(intent.colIndex, intent.previewSizePx).catch(() => undefined) }; cleanup(); bumpRender() }
    const cleanup = () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); store.setter(cancelPointerAtom); runtime.cancelResize = () => undefined }
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp, { once: true }); runtime.cancelResize = cleanup; bumpRender()
  }

  function startRowResize(event: PointerEvent, row: number) {
    event.preventDefault(); event.stopPropagation(); runtime.cancelResize(); runtime.cancelFill()
    const startClientY = event.clientY; const startSize = getRenderedRowHeight(row); let previewSize = startSize
    store.setter(startPointerAtom, { kind: 'row-resize', sheetId: props.sheetId, rowIndex: row, startSizePx: startSize, previewSizePx: startSize, source: 'pointer' })
    const onPointerMove = (moveEvent: PointerEvent) => { previewSize = startSize + moveEvent.clientY - startClientY; store.setter(updatePointerAtom, { kind: 'row-resize', previewSizePx: previewSize }); store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: row, heightPx: previewSize }); bumpRender() }
    const onPointerUp = () => { const intent = store.setter(commitPointerAtom); if (intent?.type === 'pointer.row-resize.commit') { store.setter(setViewportRowHeightAtom, { sheetId: props.sheetId, rowIndex: intent.rowIndex, heightPx: intent.previewSizePx }); void persistRowHeight(intent.rowIndex, intent.previewSizePx).catch(() => undefined) }; cleanup(); bumpRender() }
    const cleanup = () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); store.setter(cancelPointerAtom); runtime.cancelResize = () => undefined }
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp, { once: true }); runtime.cancelResize = cleanup; bumpRender()
  }

  Object.assign(runtime, { startColumnResize, startRowResize })
}
