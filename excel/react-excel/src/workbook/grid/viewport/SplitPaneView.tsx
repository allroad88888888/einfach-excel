import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetZoomAtom,
  getAxisOffsetForIndex,
  getViewportColumnWidth,
  getViewportRowHeight,
  selectCellAtom,
  setSplitWindowScrollAtom,
  startCellEditingFromProjectionAtom,
  viewportShowGridlinesAtom,
  type SplitPaneId,
  type WorkbookDocumentSheet,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
} from 'react'
import { gridZoomOf } from '../../zoom/grid-zoom'
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
  const selectCell = useSetAtom(selectCellAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setSplitScroll = useSetAtom(setSplitWindowScrollAtom)
  const { gutter, heading } = useGridGutter()
  const paneRef = useRef<HTMLDivElement>(null)

  const ownsVertical = pane === 'bottom' || pane === 'bottom-left' || pane === 'bottom-right'
  const ownsHorizontal = pane === 'right' || pane === 'top-right' || pane === 'bottom-right'
  const showRowHeaders = gutter > 0 && (pane === 'bottom' || pane === 'bottom-left')
  const showColHeaders = heading > 0 && (pane === 'right' || pane === 'top-right')
  const paneGutter = showRowHeaders ? gutter : 0
  const paneHeading = showColHeaders ? heading : 0

  const {
    activeSnapshot,
    displayWindow,
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

  const colOffset = (index: number) =>
    getAxisOffsetForIndex(index, activeSheet.colCount, metrics.colWidth, colWidths)
  const sheetContentWidth = colOffset(activeSheet.colCount)
  const sheetContentHeight = getAxisOffsetForIndex(
    activeSheet.rowCount,
    activeSheet.rowCount,
    metrics.rowHeight,
    rowHeights,
  )
  const windowOffsetY = getAxisOffsetForIndex(
    displayWindow.rowStart,
    activeSheet.rowCount,
    metrics.rowHeight,
    rowHeights,
  )
  const windowOffsetX = `${colOffset(displayWindow.colStart)}px`
  const windowWidth = colOffset(displayWindow.colEnd + 1) - colOffset(displayWindow.colStart)

  const frameStyle = {
    '--grid-column-width': `${metrics.colWidth}px`,
    '--grid-row-height': `${paneHeading}px`,
    '--grid-row-header-width': `${paneGutter}px`,
    '--grid-sheet-content-width': `${sheetContentWidth}px`,
    '--grid-sheet-height': `${sheetContentHeight + paneHeading}px`,
    '--grid-sheet-width': `${sheetContentWidth + paneGutter}px`,
  } as CSSProperties
  const rowHeaderStyle = {
    '--grid-window-offset': `${windowOffsetY}px`,
    '--grid-window-row-heights': visibleRowHeights
      .filter((height) => height > 0)
      .map((height) => `${height}px`)
      .join(' '),
  } as CSSProperties
  const colHeaderStyle = {
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-column-widths': visibleColWidths
      .filter((width) => width > 0)
      .map((width) => `${width}px`)
      .join(' '),
  } as CSSProperties
  const surfaceStyle = {
    ...rowHeaderStyle,
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-width': `${windowWidth}px`,
  } as CSSProperties

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

  const resolveCellCoord = (
    event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ) => {
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
  }

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
    if (event.button !== 0) return
    const coord = resolveCellCoord(event)
    if (!coord) return
    selectCell({ sheetId: activeSheet.id, coord, extend: event.shiftKey })
    seedCoord(coord.row, coord.col)
  }

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const coord = resolveCellCoord(event)
    if (!coord) return
    selectCell({ sheetId: activeSheet.id, coord })
    seedCoord(coord.row, coord.col)
    startEditing({ sheetId: activeSheet.id, cell: coord, source: 'formula-bar' })
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
      </div>
    </div>
  )
}
