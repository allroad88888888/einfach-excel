import {
  MAX_VIEWPORT_COL_WIDTH,
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  MIN_VIEWPORT_ROW_HEIGHT,
  cancelPointerAtom,
  commitPointerAtom,
  setViewportColumnWidthAtom,
  setViewportRowHeightAtom,
  startPointerAtom,
  updatePointerAtom,
} from '@einfach/spreadsheet-ui-core'
import { reportCommandFailure } from '../provider/command-failure'
import { clampDimension } from './grid-auto-fit'
import type { GridAutoFitControllerApi } from './grid-auto-fit-controller'
import type { GridLayoutApi } from './grid-layout'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'

type GridResizeControllerRuntime = GridRuntimeBase &
  Pick<GridLayoutApi, 'getRenderedColumnWidth' | 'getRenderedRowHeight'> &
  Pick<GridAutoFitControllerApi, 'persistColumnWidth' | 'persistRowHeight'>

type ResizeAxis = 'horizontal' | 'vertical'

interface PointerResizeSession {
  readonly event: PointerEvent
  readonly axis: ResizeAxis
  readonly startSize: number
  readonly minSize: number
  readonly maxSize: number
  readonly onPreview: (size: number) => void
  readonly onCommit: () => void
  readonly onCancel: () => void
  readonly setCancel: (cancel: () => void) => void
}

function canStartResize(event: PointerEvent): boolean {
  if (event.isPrimary === false) return false
  return event.pointerType !== 'mouse' || event.button === 0
}

function matchesPointer(startEvent: PointerEvent, nextEvent: PointerEvent): boolean {
  return startEvent.pointerId === nextEvent.pointerId
}

/** Installs the DOM-only listeners for one active header resize session. */
function installPointerResizeSession(session: PointerResizeSession): void {
  const startPosition =
    session.axis === 'horizontal' ? session.event.clientX : session.event.clientY
  let active = true

  const cleanup = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    session.setCancel(() => undefined)
  }

  const cancel = () => {
    if (!active) return
    active = false
    cleanup()
    session.onCancel()
  }

  const commit = () => {
    if (!active) return
    active = false
    cleanup()
    session.onCommit()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!matchesPointer(session.event, event)) return
    const position = session.axis === 'horizontal' ? event.clientX : event.clientY
    const previewSize = clampDimension(
      session.startSize + position - startPosition,
      session.minSize,
      session.maxSize,
    )
    session.onPreview(previewSize)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (matchesPointer(session.event, event)) commit()
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (matchesPointer(session.event, event)) cancel()
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  session.setCancel(cancel)
}

export function installGridResizeController(runtime: GridResizeControllerRuntime) {
  const {
    props,
    store,
    dom,
    getRenderedColumnWidth,
    getRenderedRowHeight,
    persistColumnWidth,
    persistRowHeight,
  } = runtime

  function cancelConflictingPointerInteractions(): void {
    dom.cancelDragSelection()
    dom.cancelFill()
    dom.cancelResize()
    store.setter(cancelPointerAtom)
  }

  function startColumnResize(event: PointerEvent, col: number) {
    if (!canStartResize(event)) return
    event.preventDefault()
    event.stopPropagation()
    cancelConflictingPointerInteractions()

    const startSize = clampDimension(
      getRenderedColumnWidth(col),
      MIN_VIEWPORT_COL_WIDTH,
      MAX_VIEWPORT_COL_WIDTH,
    )
    store.setter(startPointerAtom, {
      kind: 'column-resize',
      sheetId: props.sheetId,
      colIndex: col,
      startSizePx: startSize,
      previewSizePx: startSize,
      source: 'pointer',
    })
    installPointerResizeSession({
      event,
      axis: 'horizontal',
      startSize,
      minSize: MIN_VIEWPORT_COL_WIDTH,
      maxSize: MAX_VIEWPORT_COL_WIDTH,
      onPreview: (widthPx) => {
        store.setter(updatePointerAtom, { kind: 'column-resize', previewSizePx: widthPx })
        store.setter(setViewportColumnWidthAtom, {
          sheetId: props.sheetId,
          colIndex: col,
          widthPx,
        })
      },
      onCommit: () => {
        const intent = store.setter(commitPointerAtom)
        if (intent?.type !== 'pointer.column-resize.commit') return
        store.setter(setViewportColumnWidthAtom, {
          sheetId: props.sheetId,
          colIndex: intent.colIndex,
          widthPx: intent.previewSizePx,
        })
        void persistColumnWidth(intent.colIndex, intent.previewSizePx).catch((error) => {
          reportCommandFailure(store, error, 'Resizing the column failed.')
        })
      },
      onCancel: () => {
        store.setter(setViewportColumnWidthAtom, {
          sheetId: props.sheetId,
          colIndex: col,
          widthPx: startSize,
        })
        store.setter(cancelPointerAtom)
      },
      setCancel: dom.setCancelResize,
    })
  }

  function startRowResize(event: PointerEvent, row: number) {
    if (!canStartResize(event)) return
    event.preventDefault()
    event.stopPropagation()
    cancelConflictingPointerInteractions()

    const startSize = clampDimension(
      getRenderedRowHeight(row),
      MIN_VIEWPORT_ROW_HEIGHT,
      MAX_VIEWPORT_ROW_HEIGHT,
    )
    store.setter(startPointerAtom, {
      kind: 'row-resize',
      sheetId: props.sheetId,
      rowIndex: row,
      startSizePx: startSize,
      previewSizePx: startSize,
      source: 'pointer',
    })
    installPointerResizeSession({
      event,
      axis: 'vertical',
      startSize,
      minSize: MIN_VIEWPORT_ROW_HEIGHT,
      maxSize: MAX_VIEWPORT_ROW_HEIGHT,
      onPreview: (heightPx) => {
        store.setter(updatePointerAtom, { kind: 'row-resize', previewSizePx: heightPx })
        store.setter(setViewportRowHeightAtom, {
          sheetId: props.sheetId,
          rowIndex: row,
          heightPx,
        })
      },
      onCommit: () => {
        const intent = store.setter(commitPointerAtom)
        if (intent?.type !== 'pointer.row-resize.commit') return
        store.setter(setViewportRowHeightAtom, {
          sheetId: props.sheetId,
          rowIndex: intent.rowIndex,
          heightPx: intent.previewSizePx,
        })
        void persistRowHeight(intent.rowIndex, intent.previewSizePx).catch((error) => {
          reportCommandFailure(store, error, 'Resizing the row failed.')
        })
      },
      onCancel: () => {
        store.setter(setViewportRowHeightAtom, {
          sheetId: props.sheetId,
          rowIndex: row,
          heightPx: startSize,
        })
        store.setter(cancelPointerAtom)
      },
      setCancel: dom.setCancelResize,
    })
  }

  return installGridFeature(runtime, { startColumnResize, startRowResize })
}

export type GridResizeControllerApi = ReturnType<typeof installGridResizeController>
