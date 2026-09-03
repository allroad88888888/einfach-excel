import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  editingSessionAtom,
  selectionSnapshotAtom,
  setViewportMetricsAtom,
  startCellEditingFromProjectionAtom,
  viewportMetricsAtom,
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

/** Coordinates DOM events for the active workbook grid. */
export function useWorkbookGridEvents(viewport: WorkbookViewport) {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setViewportMetrics = useSetAtom(setViewportMetricsAtom)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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
    const nextScrollTop = Math.min(viewportMetrics.scrollTop, maxScrollTop)
    if (scroll.scrollTop !== nextScrollTop) scroll.scrollTop = nextScrollTop
    const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth)
    const nextScrollLeft = Math.min(viewportMetrics.scrollLeft, maxScrollLeft)
    if (scroll.scrollLeft !== nextScrollLeft) scroll.scrollLeft = nextScrollLeft
  }, [viewportMetrics.scrollLeft, viewportMetrics.scrollTop])

  const onScroll = (event: ReactUiEvent<HTMLDivElement>) => {
    if (activeSheet === null) return
    const { clientHeight, scrollHeight, scrollLeft, scrollTop } = event.currentTarget
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
    const visibleRowCount = viewport.window.rowEnd - viewport.window.rowStart + 1
    const nextScrollTop =
      maxScrollTop > 0 && scrollTop >= maxScrollTop - 1
        ? (activeSheet.rowCount - visibleRowCount) * WORKBOOK_GRID_ROW_HEIGHT
        : scrollTop
    if (nextScrollTop === viewportMetrics.scrollTop && scrollLeft === viewportMetrics.scrollLeft)
      return
    setViewportMetrics({ ...viewportMetrics, scrollTop: nextScrollTop, scrollLeft })
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      activeSheet === null ||
      viewport.retained ||
      event.key !== 'Enter' ||
      editingSession.source !== null
    )
      return
    event.preventDefault()
    startCellEditing({
      sheetId: activeSheet.id,
      cell: { row: selection.activeCell.row, col: selection.activeCell.col },
    })
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
