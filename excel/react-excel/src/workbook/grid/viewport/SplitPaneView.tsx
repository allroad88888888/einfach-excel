import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetZoomAtom,
  activeSplitPaneAtom,
  editingSessionAtom,
  formatPainterAtom,
  formulaReferenceActiveAtom,
  getAxisOffsetForIndex,
  getViewportColumnWidth,
  getViewportRowHeight,
  setSplitWindowScrollAtom,
  startCellEditingFromProjectionAtom,
  viewportShowGridlinesAtom,
  type SplitPaneId,
  type WorkbookDocumentSheet,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
} from 'react'
import { PaneValidationCircles } from '../../advanced-validation/ValidationCirclesOverlay'
import { useGridPointerSelection } from '../../selection/use-grid-pointer-selection'
import { gridZoomOf } from '../../zoom/grid-zoom'
import { useGridZoomWheel } from '../../zoom/use-grid-zoom-wheel'
import { CellEditor } from '../editor/CellEditor'
import { CellRenderer } from './CellRenderer'
import { GridHeading } from './GridHeading'
import { useGridGutter } from './grid-gutter'
import { useSplitPaneProjection } from './use-split-pane-projection'
import { workbookCellAt, workbookCellAtViewportPoint } from './workbook-grid-hit-test'

interface SplitPaneViewProps {
  readonly pane: SplitPaneId
  readonly activeSheet: WorkbookDocumentSheet
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly primaryScrollRef: RefObject<HTMLDivElement | null>
  readonly focusGrid: () => void
}

function buildSplitPaneStyles(input: {
  readonly activeSheet: WorkbookDocumentSheet
  readonly colStart: number
  readonly colEnd: number
  readonly rowStart: number
  readonly colWidth: number
  readonly rowHeight: number
  readonly colWidths: Record<string, number> | undefined
  readonly rowHeights: Record<string, number> | undefined
  readonly visibleColWidths: readonly number[]
  readonly visibleRowHeights: readonly number[]
  readonly paneGutter: number
  readonly paneHeading: number
}) {
  const colOffset = (index: number) =>
    getAxisOffsetForIndex(index, input.activeSheet.colCount, input.colWidth, input.colWidths)
  const sheetContentWidth = colOffset(input.activeSheet.colCount)
  const sheetContentHeight = getAxisOffsetForIndex(
    input.activeSheet.rowCount,
    input.activeSheet.rowCount,
    input.rowHeight,
    input.rowHeights,
  )
  const windowOffsetY = getAxisOffsetForIndex(
    input.rowStart,
    input.activeSheet.rowCount,
    input.rowHeight,
    input.rowHeights,
  )
  const windowOffsetX = `${colOffset(input.colStart)}px`
  const windowWidth = colOffset(input.colEnd + 1) - colOffset(input.colStart)
  const frameStyle = {
    '--grid-column-width': `${input.colWidth}px`,
    '--grid-row-height': `${input.paneHeading}px`,
    '--grid-row-header-width': `${input.paneGutter}px`,
    '--grid-sheet-content-width': `${sheetContentWidth}px`,
    '--grid-sheet-height': `${sheetContentHeight + input.paneHeading}px`,
    '--grid-sheet-width': `${sheetContentWidth + input.paneGutter}px`,
  } as CSSProperties
  const rowHeaderStyle = {
    '--grid-window-offset': `${windowOffsetY}px`,
    '--grid-window-row-heights': input.visibleRowHeights
      .filter((height) => height > 0)
      .map((height) => `${height}px`)
      .join(' '),
  } as CSSProperties
  const colHeaderStyle = {
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-column-widths': input.visibleColWidths
      .filter((width) => width > 0)
      .map((width) => `${width}px`)
      .join(' '),
  } as CSSProperties
  const surfaceStyle = {
    ...rowHeaderStyle,
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-width': `${windowWidth}px`,
  } as CSSProperties
  return { frameStyle, rowHeaderStyle, colHeaderStyle, surfaceStyle }
}

/** Secondary split pane backed by bounded Rust display-range reads and coupled scroll sync. */
export function SplitPaneView({
  pane,
  activeSheet,
  scrollTop,
  scrollLeft,
  primaryScrollRef,
  focusGrid,
}: SplitPaneViewProps) {
  const { t } = useLingui()
  const zoom = useAtomValue(activeSheetZoomAtom)
  const showGridlines = useAtomValue(viewportShowGridlinesAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const pickingReference = useAtomValue(formulaReferenceActiveAtom)
  const painter = useAtomValue(formatPainterAtom)
  const setActiveSplitPane = useSetAtom(activeSplitPaneAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setSplitScroll = useSetAtom(setSplitWindowScrollAtom)
  const { gutter, heading } = useGridGutter()
  const paneRef = useRef<HTMLDivElement>(null)
  useGridZoomWheel(paneRef)

  const ownsVertical = pane === 'bottom' || pane === 'bottom-left' || pane === 'bottom-right'
  const ownsHorizontal = pane === 'right' || pane === 'top-right' || pane === 'bottom-right'
  const showRowHeaders = gutter > 0 && (pane === 'bottom' || pane === 'bottom-left')
  const showColHeaders = heading > 0 && (pane === 'right' || pane === 'top-right')
  const paneGutter = showRowHeaders ? gutter : 0
  const paneHeading = showColHeaders ? heading : 0

  const {
    activeSnapshot,
    displayWindow,
    paneSize,
    metrics,
    sizeOverrides,
    rowHeights,
    colWidths,
    seedActiveCellFact,
  } = useSplitPaneProjection({
    pane,
    paneRef,
    activeSheet,
    scrollTop,
    scrollLeft,
    paneGutter,
    paneHeading,
  })

  useLayoutEffect(() => {
    const node = paneRef.current
    if (!node) return
    if (Math.abs(node.scrollTop - scrollTop) > 1) node.scrollTop = scrollTop
    if (Math.abs(node.scrollLeft - scrollLeft) > 1) node.scrollLeft = scrollLeft
  }, [scrollTop, scrollLeft])

  const rowCount = Math.max(0, displayWindow.rowEnd - displayWindow.rowStart + 1)
  const colCount = Math.max(0, displayWindow.colEnd - displayWindow.colStart + 1)
  const visibleRowHeights = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, i) =>
        getViewportRowHeight(
          sizeOverrides,
          activeSheet.id,
          displayWindow.rowStart + i,
          metrics.rowHeight,
        ),
      ),
    [rowCount, sizeOverrides, activeSheet.id, displayWindow.rowStart, metrics.rowHeight],
  )
  const visibleColWidths = useMemo(
    () =>
      Array.from({ length: colCount }, (_, i) =>
        getViewportColumnWidth(
          sizeOverrides,
          activeSheet.id,
          displayWindow.colStart + i,
          metrics.colWidth,
        ),
      ),
    [colCount, sizeOverrides, activeSheet.id, displayWindow.colStart, metrics.colWidth],
  )

  const { frameStyle, rowHeaderStyle, colHeaderStyle, surfaceStyle } = buildSplitPaneStyles({
    activeSheet,
    colStart: displayWindow.colStart,
    colEnd: displayWindow.colEnd,
    rowStart: displayWindow.rowStart,
    colWidth: metrics.colWidth,
    rowHeight: metrics.rowHeight,
    colWidths,
    rowHeights,
    visibleColWidths,
    visibleRowHeights,
    paneGutter,
    paneHeading,
  })

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget
    const primary = primaryScrollRef.current
    if (ownsVertical) {
      setSplitScroll({ scrollTop: node.scrollTop })
    } else if (primary && Math.abs(primary.scrollTop - node.scrollTop) > 1) {
      primary.scrollTop = node.scrollTop
    }
    if (ownsHorizontal) {
      setSplitScroll({ scrollLeft: node.scrollLeft })
    } else if (primary && Math.abs(primary.scrollLeft - node.scrollLeft) > 1) {
      primary.scrollLeft = node.scrollLeft
    }
  }

  const resolveCellCoord = useCallback(
    (event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      const direct = workbookCellAt(event)
      if (direct) return direct
      const node = paneRef.current
      if (!node) return null
      return workbookCellAtViewportPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: node.getBoundingClientRect(),
        zoom: gridZoomOf(node),
        scrollTop: node.scrollTop,
        scrollLeft: node.scrollLeft,
        rowHeight: metrics.rowHeight,
        colWidth: metrics.colWidth,
        rowHeights,
        colWidths,
        rowHeaderWidth: paneGutter,
        columnHeaderHeight: paneHeading,
        rowCount: activeSheet.rowCount,
        colCount: activeSheet.colCount,
        frozenHeight: 0,
        frozenWidth: 0,
      })
    },
    [
      activeSheet.colCount,
      activeSheet.rowCount,
      colWidths,
      metrics.colWidth,
      metrics.rowHeight,
      paneGutter,
      paneHeading,
      rowHeights,
    ],
  )

  const pointerHandlers = useGridPointerSelection({
    enabled: true,
    getCellCoord: resolveCellCoord,
    sheetId: activeSheet.id,
  })

  const seedCoord = (row: number, col: number) => {
    if (!activeSnapshot) return
    const fact = activeSnapshot.cells.find((c) => c.row === row && c.col === col) ?? null
    seedActiveCellFact({
      sheetId: activeSheet.id,
      cell: { row, col },
      revision: activeSnapshot.revision,
      fact,
    })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const coord = resolveCellCoord(event)
    if (!coord) return
    if (!pickingReference) {
      setActiveSplitPane(pane)
      focusGrid()
    }
    if (!pointerHandlers.onPointerDown(event)) return
    seedCoord(coord.row, coord.col)
  }

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (pickingReference || painter.mode !== 'idle') return
    const coord = resolveCellCoord(event)
    if (!coord) return
    setActiveSplitPane(pane)
    seedCoord(coord.row, coord.col)
    const frame = event.currentTarget
    const isCurrent = () => frame.isConnected
    const restoreDraftFocus = (started: boolean) => {
      if (started || !isCurrent() || editingSession.source === null) return
      const selector =
        editingSession.source.source === 'formula-bar'
          ? '[data-formula-input="true"]'
          : '[data-cell-editor] textarea'
      frame
        .closest('.workbook')
        ?.querySelector<HTMLTextAreaElement>(selector)
        ?.focus({ preventScroll: true })
    }
    const started = startEditing({
      sheetId: activeSheet.id,
      cell: coord,
      waitForPending: true,
      isCurrent,
    })
    if (typeof started === 'boolean') restoreDraftFocus(started)
    else void started.then(restoreDraftFocus)
  }

  const paneLabel =
    pane === 'bottom'
      ? t`Bottom split pane`
      : pane === 'right'
        ? t`Right split pane`
        : pane === 'top-right'
          ? t`Top-right split pane`
          : pane === 'bottom-left'
            ? t`Bottom-left split pane`
            : t`Bottom-right split pane`

  let columnTrack = 0
  return (
    <div
      ref={paneRef}
      className="split-pane-scroll"
      data-split-pane={pane}
      data-zoom={zoom}
      role="region"
      aria-label={paneLabel}
      style={zoom === 100 ? undefined : { zoom: zoom / 100 }}
      onScroll={handleScroll}
    >
      <div
        className="sheet-grid-frame grid-viewport-frame"
        data-gutter={paneGutter}
        data-heading={paneHeading}
        data-gridlines={showGridlines ? undefined : 'hidden'}
        style={frameStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={pointerHandlers.onPointerMove}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onLostPointerCapture={pointerHandlers.onPointerCancel}
        onDoubleClick={handleDoubleClick}
      >
        {showColHeaders && (
          <div className="column-headers" role="row" style={colHeaderStyle}>
            {visibleColWidths.map((width, index) => {
              if (width === 0) return null
              columnTrack += 1
              return (
                <GridHeading
                  key={displayWindow.colStart + index}
                  axis="column"
                  index={displayWindow.colStart + index}
                  focusGrid={focusGrid}
                  style={{ gridColumn: columnTrack }}
                />
              )
            })}
          </div>
        )}
        {showRowHeaders && (
          <div className="row-headers grid-window" style={rowHeaderStyle}>
            {visibleRowHeights.map((height, index) =>
              height === 0 ? null : (
                <GridHeading
                  key={displayWindow.rowStart + index}
                  axis="row"
                  index={displayWindow.rowStart + index}
                  focusGrid={focusGrid}
                />
              ),
            )}
          </div>
        )}
        <div className="grid-surface grid-window" style={surfaceStyle}>
          {activeSnapshot && (
            <CellRenderer
              interactive={true}
              cells={activeSnapshot.cells}
              anchors={activeSnapshot.mergeAnchors}
              mergedRanges={activeSnapshot.mergedRanges}
              window={displayWindow}
              rowHeights={visibleRowHeights}
              columnWidths={visibleColWidths}
            />
          )}
        </div>
        <PaneValidationCircles
          scrollTop={scrollTop}
          scrollLeft={scrollLeft}
          viewportWidth={paneSize.width}
          viewportHeight={paneSize.height}
          gutter={paneGutter}
          heading={paneHeading}
          freeze={null}
          mergedRanges={activeSnapshot?.mergedRanges}
          showStatus={false}
        />
        <CellEditor
          focusGrid={focusGrid}
          pane={pane}
          paneViewport={{
            scrollTop,
            scrollLeft,
            viewportWidth: paneSize.width,
            viewportHeight: paneSize.height,
            gutter: paneGutter,
            heading: paneHeading,
            mergedRanges: activeSnapshot?.mergedRanges,
          }}
        />
      </div>
    </div>
  )
}
