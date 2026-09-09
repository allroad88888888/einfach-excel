import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  getAxisOffsetForIndex,
  getViewportRowHeight,
  getViewportColumnWidth,
  selectionSnapshotAtom,
  viewportGeometrySizesAtom,
  projectedFreezeAtom,
  type WorkbookDocumentSheet,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { useWorkbookViewport, type WorkbookViewport } from '../../projection/use-workbook-viewport'
import { SpreadsheetGrid } from '../cells/SpreadsheetGrid'
import { MergedCells } from '../cells/MergedCells'
import { CellEditor } from '../editor/CellEditor'
import { ResizeGuide } from './ResizeGuide'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'
import { useWorkbookGridEvents } from './use-workbook-grid-events'
import { useGridClipboard } from '../../clipboard/use-grid-clipboard'
import { useWorkbookGridWindow } from './use-workbook-grid-window'
import { GridHeaders } from './GridHeaders'
import { FrozenGrid } from './FrozenGrid'
import { FillHandle } from '../fill/FillHandle'
import './grid.css'

function rowNumbers(rowStart: number, rowEnd: number): readonly number[] {
  return Array.from(
    { length: Math.max(0, rowEnd - rowStart + 1) },
    (_, index) => rowStart + index + 1,
  )
}

function projectionState(viewport: WorkbookViewport) {
  if (viewport.status === 'error') {
    return (
      <div className="grid-projection-state" role="alert">
        {viewport.error?.message}
      </div>
    )
  }
  if (viewport.status !== 'ready' && !viewport.hasResult) {
    return (
      <div className="grid-projection-state" role="status">
        Loading visible cells…
      </div>
    )
  }
  return null
}

function WorkbookGridProjection({ activeSheet }: { readonly activeSheet: WorkbookDocumentSheet }) {
  const selection = useAtomValue(selectionSnapshotAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const gridWindow = useWorkbookGridWindow()
  const viewport = useWorkbookViewport({
    sheetId: activeSheet.id,
    window: gridWindow,
    rowCount: activeSheet.rowCount,
    colCount: activeSheet.colCount,
  })
  const events = useWorkbookGridEvents(viewport)
  const clipboard = useGridClipboard(viewport.retained)
  const frozenRows = freeze?.sheetId === activeSheet.id ? freeze.rows : 0
  const frozenCols = freeze?.sheetId === activeSheet.id ? freeze.cols : 0
  const bodyWindow = {
    ...viewport.window,
    rowStart: Math.max(viewport.window.rowStart, frozenRows),
    colStart: Math.max(viewport.window.colStart, frozenCols),
  }
  const rows = rowNumbers(bodyWindow.rowStart, bodyWindow.rowEnd)
  const rowHeights = sizeOverrides.rowHeightsBySheet[activeSheet.id]
  const columnWidths = Array.from({ length: activeSheet.colCount }, (_, col) =>
    getViewportColumnWidth(sizeOverrides, activeSheet.id, col, WORKBOOK_GRID_COLUMN_WIDTH),
  )
  const columnOffset = (index: number) =>
    getAxisOffsetForIndex(
      index,
      activeSheet.colCount,
      WORKBOOK_GRID_COLUMN_WIDTH,
      sizeOverrides.colWidthsBySheet[activeSheet.id],
    )
  const sheetContentWidth = columnOffset(activeSheet.colCount)
  const visibleRowHeights = rows.map((_, index) =>
    getViewportRowHeight(
      sizeOverrides,
      activeSheet.id,
      bodyWindow.rowStart + index,
      WORKBOOK_GRID_ROW_HEIGHT,
    ),
  )
  const sheetContentHeight = getAxisOffsetForIndex(
    activeSheet.rowCount,
    activeSheet.rowCount,
    WORKBOOK_GRID_ROW_HEIGHT,
    rowHeights,
  )
  const windowOffset = getAxisOffsetForIndex(
    Math.max(viewport.placementWindow.rowStart, frozenRows),
    activeSheet.rowCount,
    WORKBOOK_GRID_ROW_HEIGHT,
    rowHeights,
  )
  const frameStyle = {
    '--grid-column-count': columnWidths.filter((width) => width > 0).length,
    '--grid-column-width': `${WORKBOOK_GRID_COLUMN_WIDTH}px`,
    '--grid-column-widths': columnWidths
      .filter((width) => width > 0)
      .map((width) => `${width}px`)
      .join(' '),
    '--grid-row-height': `${WORKBOOK_GRID_ROW_HEIGHT}px`,
    '--grid-row-header-width': `${WORKBOOK_GRID_ROW_HEADER_WIDTH}px`,
    '--grid-sheet-content-width': `${sheetContentWidth}px`,
    '--grid-sheet-height': `${sheetContentHeight + WORKBOOK_GRID_ROW_HEIGHT}px`,
    '--grid-sheet-width': `${sheetContentWidth + WORKBOOK_GRID_ROW_HEADER_WIDTH}px`,
  } as CSSProperties
  const windowStyle = {
    '--grid-window-offset': `${windowOffset}px`,
    '--grid-window-row-heights': visibleRowHeights
      .filter((height) => height > 0)
      .map((height) => `${height}px`)
      .join(' '),
  } as CSSProperties
  const cellWindowStyle = {
    ...windowStyle,
    '--grid-window-offset-x': `${columnOffset(Math.max(viewport.placementWindow.colStart, frozenCols))}px`,
    '--grid-window-width': `${
      columnOffset(Math.max(viewport.placementWindow.colEnd + 1, frozenCols)) -
      columnOffset(Math.max(viewport.placementWindow.colStart, frozenCols))
    }px`,
  } as CSSProperties

  return (
    <section className="worksheet-panel" aria-label={`${activeSheet.name} worksheet`}>
      {(sheetContentHeight === 0 || sheetContentWidth === 0) && (
        <div className="grid-visibility-state" role="status">
          All {sheetContentHeight === 0 ? 'rows' : 'columns'} are hidden. Use Hide / Unhide to
          restore them.
        </div>
      )}
      <div
        ref={events.scrollRef}
        className="sheet-scroll"
        data-testid="sheet-scroll"
        onScroll={events.onScroll}
      >
        <div
          className="sheet-grid-frame grid-viewport-frame"
          data-frozen-rows={frozenRows}
          data-frozen-cols={frozenCols}
          style={frameStyle}
          onCopy={clipboard.onCopy}
          onCut={clipboard.onCut}
          onPaste={clipboard.onPaste}
          onDoubleClick={events.onDoubleClick}
          onKeyDown={events.onKeyDown}
          onPointerDown={events.onPointerDown}
          onPointerMove={events.onPointerMove}
          onPointerUp={events.onPointerUp}
          onPointerCancel={events.onPointerCancel}
        >
          <GridHeaders
            rowStart={bodyWindow.rowStart}
            rowHeights={visibleRowHeights}
            columnWidths={columnWidths}
            rowStyle={windowStyle}
            focusGrid={events.focusGrid}
          />
          <div
            ref={events.gridRef}
            className="grid-surface grid-window"
            data-workbook-grid="true"
            data-row-count={activeSheet.rowCount}
            data-projection-retained={viewport.retained ? 'true' : 'false'}
            aria-busy={viewport.retained}
            aria-label={`${activeSheet.name} cells`}
            style={cellWindowStyle}
            tabIndex={viewport.retained ? -1 : 0}
          >
            {projectionState(viewport) ?? (
              <SpreadsheetGrid
                cells={viewport.cells}
                mergedRanges={viewport.mergedRanges}
                selected={selection.range}
                window={bodyWindow}
                rowHeights={visibleRowHeights}
                columnWidths={columnWidths.slice(bodyWindow.colStart, bodyWindow.colEnd + 1)}
              />
            )}
            <MergedCells window={bodyWindow} />
          </div>
          <FrozenGrid focusGrid={events.focusGrid} />
          <FillHandle scrollRef={events.scrollRef} focusGrid={events.focusGrid} />
          <CellEditor focusGrid={events.focusGrid} />
          <ResizeGuide />
        </div>
      </div>
    </section>
  )
}

/** Renders the visible Rust projection for the active workbook sheet. */
export function WorkbookGrid() {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  if (activeSheet === null) {
    return <div role="alert">The active workbook sheet is unavailable.</div>
  }
  return <WorkbookGridProjection activeSheet={activeSheet} />
}
