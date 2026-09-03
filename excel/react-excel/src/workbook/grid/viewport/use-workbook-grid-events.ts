import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  dispatchKeyboardInputAtom,
  editingSessionAtom,
  selectionSnapshotAtom,
  setViewportMetricsAtom,
  startCellEditingFromProjectionAtom,
  viewportMetricsAtom,
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
import { useGridPointerSelection } from '../../selection/use-grid-pointer-selection'
import { WORKBOOK_GRID_ROW_HEIGHT } from './workbook-grid-config'
import { workbookCellAt } from './workbook-grid-hit-test'
import {
  getWorkbookGridViewportHeight,
  getWorkbookGridViewportWidth,
  useWorkbookGridViewportMeasurement,
} from './use-workbook-grid-viewport-measurement'

/** Coordinates DOM events for the active workbook grid. */
export function useWorkbookGridEvents(viewport: WorkbookViewport) {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const dispatchKeyboardInput = useSetAtom(dispatchKeyboardInputAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setViewportMetrics = useSetAtom(setViewportMetricsAtom)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useWorkbookGridViewportMeasurement(scrollRef)
  const focusGrid = useCallback(() => gridRef.current?.focus({ preventScroll: true }), [])
  const pointerHandlers = useGridPointerSelection({
    enabled: !viewport.retained && activeSheet !== null,
    getCellCoord: workbookCellAt,
    sheetId: activeSheet?.id ?? '',
  })

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    const selectionIsOnLastRow =
      activeSheet !== null && selection.activeCell.row === activeSheet.rowCount - 1
    const nextScrollTop = selectionIsOnLastRow
      ? maxScrollTop
      : Math.min(viewportMetrics.scrollTop, maxScrollTop)
    if (scroll.scrollTop !== nextScrollTop) scroll.scrollTop = nextScrollTop
    const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth)
    const selectionIsOnLastColumn =
      activeSheet !== null && selection.activeCell.col === activeSheet.colCount - 1
    const nextScrollLeft = selectionIsOnLastColumn
      ? maxScrollLeft
      : Math.min(viewportMetrics.scrollLeft, maxScrollLeft)
    if (scroll.scrollLeft !== nextScrollLeft) scroll.scrollLeft = nextScrollLeft
  }, [
    activeSheet,
    selection.activeCell.col,
    selection.activeCell.row,
    viewportMetrics.scrollLeft,
    viewportMetrics.scrollTop,
  ])

  const onScroll = (event: ReactUiEvent<HTMLDivElement>) => {
    if (activeSheet === null) return
    const { clientHeight, clientWidth, scrollHeight, scrollLeft, scrollTop } = event.currentTarget
    const measuredHeight = getWorkbookGridViewportHeight(clientHeight)
    const measuredWidth = getWorkbookGridViewportWidth(clientWidth)
    const viewportHeight = measuredHeight > 0 ? measuredHeight : viewportMetrics.viewportHeight
    const viewportWidth = measuredWidth > 0 ? measuredWidth : viewportMetrics.viewportWidth
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
    const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / viewportMetrics.rowHeight))
    const nextScrollTop =
      maxScrollTop > 0 && scrollTop >= maxScrollTop - 1
        ? (activeSheet.rowCount - visibleRowCount) * WORKBOOK_GRID_ROW_HEIGHT
        : scrollTop
    if (
      nextScrollTop === viewportMetrics.scrollTop &&
      scrollLeft === viewportMetrics.scrollLeft &&
      viewportHeight === viewportMetrics.viewportHeight &&
      viewportWidth === viewportMetrics.viewportWidth
    )
      return
    setViewportMetrics({
      ...viewportMetrics,
      scrollTop: nextScrollTop,
      scrollLeft,
      viewportHeight,
      viewportWidth,
    })
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (activeSheet === null || viewport.retained || editingSession.source !== null) return

    const navigationInput = getGridNavigationInput(event, viewportMetrics)
    if (navigationInput !== null) {
      event.preventDefault()
      dispatchKeyboardInput(navigationInput)
      return
    }

    if (isPrintableCellEntry(event)) {
      event.preventDefault()
      startCellEditing({
        sheetId: activeSheet.id,
        cell: { row: selection.activeCell.row, col: selection.activeCell.col },
        source: 'keyboard',
        initialDraft: event.key,
      })
      return
    }

    if (event.key === 'F2') {
      event.preventDefault()
      startCellEditing({
        sheetId: activeSheet.id,
        cell: { row: selection.activeCell.row, col: selection.activeCell.col },
        source: 'keyboard',
      })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      startCellEditing({
        sheetId: activeSheet.id,
        cell: { row: selection.activeCell.row, col: selection.activeCell.col },
      })
    }
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewport.retained) return
    event.currentTarget.focus({ preventScroll: true })
    pointerHandlers.onPointerDown(event)
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
    onPointerCancel: pointerHandlers.onPointerCancel,
    onPointerDown,
    onPointerMove: pointerHandlers.onPointerMove,
    onPointerUp: pointerHandlers.onPointerUp,
    onScroll,
    scrollRef,
  }
}

/** Normalizes browser keys without duplicating movement rules from UI Core. */
function getGridNavigationInput(
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
  if (isArrowKey(event.key) || event.key === 'Home' || event.key === 'End') {
    return event.altKey ? null : input
  }
  if (event.key === 'Tab') {
    return event.ctrlKey || event.metaKey || event.altKey ? null : input
  }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    if (event.ctrlKey || event.metaKey || event.altKey) return null
    return { ...input, pageRowDelta: visiblePageRowCount(metrics) }
  }
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
