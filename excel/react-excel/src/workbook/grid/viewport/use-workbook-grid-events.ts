import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  dispatchGridCellKeyboardInputAtom,
  editingSessionAtom,
  formulaReferenceActiveAtom,
  formatPainterAtom,
  runFormatPainterAtom,
  selectionSnapshotAtom,
  setViewportScrollAtom,
  startCellEditingFromProjectionAtom,
  updatePointerSelectionAtom,
  viewportMetricsAtom,
  viewportGeometrySizesAtom,
  projectedFreezeAtom,
  pointerSessionAtom,
  type KeyboardInput,
  type ViewportMetrics,
} from '@einfach-excel/spreadsheet-ui-core'
import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUiEvent,
} from 'react'
import type { WorkbookViewport } from '../../projection/use-workbook-viewport'
import { useGridDragAutoscroll } from '../../selection/use-grid-drag-autoscroll'
import { useGridPointerSelection } from '../../selection/use-grid-pointer-selection'
import {
  workbookCellAt,
  workbookCellAtPoint,
  workbookCellAtViewportPoint,
} from './workbook-grid-hit-test'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'
import { useWorkbookGridViewportMeasurement } from './use-workbook-grid-viewport-measurement'
import { useGridHyperlink } from '../../hyperlink/use-grid-hyperlink'

/** Coordinates DOM events for the active workbook grid. */
export function useWorkbookGridEvents(viewport: WorkbookViewport) {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const pickingReference = useAtomValue(formulaReferenceActiveAtom)
  const painter = useAtomValue(formatPainterAtom)
  const pointer = useAtomValue(pointerSessionAtom)
  const runPainter = useSetAtom(runFormatPainterAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const dispatchGridKeyboard = useSetAtom(dispatchGridCellKeyboardInputAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setViewportScroll = useSetAtom(setViewportScrollAtom)
  const updatePointerSelection = useSetAtom(updatePointerSelectionAtom)
  const hyperlink = useGridHyperlink()
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useWorkbookGridViewportMeasurement(scrollRef)
  const focusGrid = useCallback(() => gridRef.current?.focus({ preventScroll: true }), [])
  const pointerHandlers = useGridPointerSelection({
    enabled: activeSheet !== null,
    getCellCoord: workbookCellAt,
    sheetId: activeSheet?.id ?? '',
  })
  const updateSelectionAtPoint = useCallback(
    ({ clientX, clientY }: { readonly clientX: number; readonly clientY: number }) => {
      if (activeSheet === null) return
      const scroll = scrollRef.current
      const coord =
        workbookCellAtPoint(clientX, clientY) ??
        (scroll === null
          ? null
          : workbookCellAtViewportPoint({
              clientX,
              clientY,
              bounds: scroll.getBoundingClientRect(),
              scrollTop: scroll.scrollTop,
              scrollLeft: scroll.scrollLeft,
              rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
              colWidth: WORKBOOK_GRID_COLUMN_WIDTH,
              colWidths: sizeOverrides.colWidthsBySheet[activeSheet.id],
              rowHeaderWidth: WORKBOOK_GRID_ROW_HEADER_WIDTH,
              rowCount: activeSheet.rowCount,
              colCount: activeSheet.colCount,
              rowHeights: sizeOverrides.rowHeightsBySheet[activeSheet.id],
              frozenHeight: freeze?.sheetId === activeSheet.id ? freeze.height : 0,
              frozenWidth: freeze?.sheetId === activeSheet.id ? freeze.width : 0,
            }))
      if (coord !== null) updatePointerSelection({ sheetId: activeSheet.id, coord })
    },
    [activeSheet, sizeOverrides, updatePointerSelection, freeze],
  )
  const dragAutoscroll = useGridDragAutoscroll({
    enabled: activeSheet !== null,
    scrollRef,
    onStep: updateSelectionAtPoint,
  })
  const stopSelectionAutoscroll = dragAutoscroll.stop
  const selecting = pointer.status === 'active' && pointer.interaction?.kind === 'drag-selection'
  useEffect(() => {
    if (!selecting) stopSelectionAutoscroll()
  }, [selecting, stopSelectionAutoscroll])

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    const nextScrollTop = Math.min(viewportMetrics.scrollTop, maxScrollTop)
    if (scroll.scrollTop !== nextScrollTop) scroll.scrollTop = nextScrollTop
    const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth)
    const nextScrollLeft = Math.min(viewportMetrics.scrollLeft, maxScrollLeft)
    if (scroll.scrollLeft !== nextScrollLeft) scroll.scrollLeft = nextScrollLeft
  }, [viewportMetrics.scrollLeft, viewportMetrics.scrollTop])

  const onScroll = (event: ReactUiEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = event.currentTarget
    setViewportScroll({ scrollTop, scrollLeft })
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea')) return
    if (activeSheet === null || editingSession.source !== null) return
    if (painter.mode === 'idle' && hyperlink.onKeyDown(event)) return
    if (painter.mode !== 'idle' && !event.nativeEvent.isComposing) {
      if (event.key === 'Enter') {
        event.preventDefault()
        void runPainter('apply')
        return
      }
      if (event.key === 'F2' || isPrintableCellEntry(event)) {
        event.preventDefault()
        return
      }
    }
    const keyboard = getGridKeyboardInput(event, {
      ...viewportMetrics,
      viewportHeight: Math.max(0, viewportMetrics.viewportHeight -
        (freeze?.sheetId === activeSheet.id ? freeze.height : 0)),
    })
    if (keyboard === null) return

    event.preventDefault()
    dispatchGridKeyboard({
      sheetId: activeSheet.id,
      cell: { row: selection.activeCell.row, col: selection.activeCell.col },
      keyboard,
      allowEditing: !viewport.retained,
    })
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewport.retained) return
    if (!pickingReference && painter.mode === 'idle' && hyperlink.onPointerDown(event)) return
    const coord = workbookCellAt(event)
    if (coord === null) return
    if (!pickingReference) focusGrid()
    if (!pointerHandlers.onPointerDown(event)) return
    if (coord !== null && event.button === 0 && event.isPrimary !== false) {
      dragAutoscroll.start(event)
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerHandlers.onPointerMove(event)
    dragAutoscroll.track(event)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragAutoscroll.stop(event.pointerId)
    pointerHandlers.onPointerUp(event)
  }
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragAutoscroll.stop(event.pointerId)
    pointerHandlers.onPointerCancel(event)
  }
  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (activeSheet === null || viewport.retained || pickingReference || painter.mode !== 'idle') return
    const cell = workbookCellAt(event)
    if (cell === null) return
    const frame = event.currentTarget
    const isCurrent = () => frame.isConnected &&
      (document.activeElement === document.body || document.activeElement === gridRef.current)
    const restoreDraftFocus = (started: boolean) => {
      // command 保留旧草稿时，只恢复其 DOM 焦点，不另建编辑会话。
      if (started || !isCurrent() || editingSession.source === null) return
      const selector = editingSession.source.source === 'formula-bar'
        ? '[data-formula-input="true"]' : '[data-cell-editor] textarea'
      gridRef.current?.closest('.workbook')
        ?.querySelector<HTMLTextAreaElement>(selector)?.focus({ preventScroll: true })
    }
    const started = startCellEditing({
      sheetId: activeSheet.id, cell, waitForPending: true, isCurrent,
    })
    if (typeof started === 'boolean') restoreDraftFocus(started)
    else void started.then(restoreDraftFocus)
  }

  return {
    focusGrid,
    gridRef,
    onDoubleClick,
    onKeyDown,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onScroll,
    scrollRef,
  }
}

/** Normalizes browser keys without duplicating movement rules from UI Core. */
function getGridKeyboardInput(
  event: ReactKeyboardEvent<HTMLDivElement>,
  metrics: ViewportMetrics,
): KeyboardInput | null {
  if (event.nativeEvent.isComposing) return null

  const input: KeyboardInput = {
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) return input
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
    ['d', 'r'].includes(event.key.toLowerCase())) return input
  if (
    isArrowKey(event.key) ||
    event.key === 'Home' ||
    event.key === 'End'
  ) {
    return event.altKey ? null : input
  }
  if (event.key === 'Enter') {
    return event.ctrlKey || event.metaKey || event.altKey ? null : input
  }
  if (event.key === 'Tab') {
    return event.ctrlKey || event.metaKey || event.altKey ? null : input
  }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    if (event.ctrlKey || event.metaKey || event.altKey) return null
    return { ...input, pageRowDelta: visiblePageRowCount(metrics) }
  }
  if (event.key === 'Escape' || event.key === 'F2' || event.key === 'Backspace' || event.key === 'Delete') {
    return event.ctrlKey || event.metaKey || event.altKey ? null : input
  }
  if (isPrintableCellEntry(event)) return input
  return null
}

function isArrowKey(key: string): boolean {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
}

function visiblePageRowCount(metrics: ViewportMetrics): number {
  return Math.max(1, Math.floor(metrics.viewportHeight / metrics.rowHeight))
}

/** Accepts text-producing keys while leaving browser and command shortcuts untouched. */
function isPrintableCellEntry(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
  return (
    event.key.length === 1 &&
    !event.nativeEvent.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  )
}
