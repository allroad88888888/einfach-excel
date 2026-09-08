import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  dispatchGridCellKeyboardInputAtom,
  editingSessionAtom,
  selectionSnapshotAtom,
  setViewportScrollAtom,
  startCellEditingFromProjectionAtom,
  updatePointerSelectionAtom,
  viewportMetricsAtom,
  viewportGeometrySizesAtom,
  type KeyboardInput,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
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

/** Coordinates DOM events for the active workbook grid. */
export function useWorkbookGridEvents(viewport: WorkbookViewport) {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const dispatchGridKeyboard = useSetAtom(dispatchGridCellKeyboardInputAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setViewportScroll = useSetAtom(setViewportScrollAtom)
  const updatePointerSelection = useSetAtom(updatePointerSelectionAtom)
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
            }))
      if (coord !== null) updatePointerSelection({ sheetId: activeSheet.id, coord })
    },
    [activeSheet, sizeOverrides, updatePointerSelection],
  )
  const dragAutoscroll = useGridDragAutoscroll({
    enabled: activeSheet !== null,
    scrollRef,
    onStep: updateSelectionAtPoint,
  })

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
    if (activeSheet === null || editingSession.source !== null) return
    const keyboard = getGridKeyboardInput(event, viewportMetrics)
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
    event.currentTarget.focus({ preventScroll: true })
    const coord = workbookCellAt(event)
    pointerHandlers.onPointerDown(event)
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
    if (activeSheet === null || viewport.retained) return
    const cell = workbookCellAt(event)
    if (cell !== null) startCellEditing({ sheetId: activeSheet.id, cell })
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
  if (event.key === 'F2' || event.key === 'Backspace' || event.key === 'Delete') {
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
