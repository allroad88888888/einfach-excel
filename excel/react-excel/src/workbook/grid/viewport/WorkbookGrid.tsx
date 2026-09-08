import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  getAxisOffsetForIndex,
  getViewportRowHeight,
  getViewportColumnWidth,
  selectionSnapshotAtom,
  selectGridHeaderAtom,
  viewportGeometrySizesAtom,
  type WorkbookDocumentSheet,
  type GridHeaderSelectionInput,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { useWorkbookViewport, type WorkbookViewport } from '../../projection/use-workbook-viewport'
import { SpreadsheetGrid } from '../cells/SpreadsheetGrid'
import { CellEditor } from '../editor/CellEditor'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'
import { useWorkbookGridEvents } from './use-workbook-grid-events'
import { useGridClipboard } from '../../clipboard/use-grid-clipboard'
import { useWorkbookGridWindow } from './use-workbook-grid-window'
import './grid.css'

function rowNumbers(rowStart: number, rowEnd: number): readonly number[] {
  return Array.from({ length: rowEnd - rowStart + 1 }, (_, index) => rowStart + index + 1)
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
  const selectHeader = useSetAtom(selectGridHeaderAtom)
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
  const selectGridHeader = async (input: GridHeaderSelectionInput) => {
    if (await selectHeader(input)) events.focusGrid()
  }
  const rows = rowNumbers(viewport.window.rowStart, viewport.window.rowEnd)
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
      viewport.window.rowStart + index,
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
    viewport.placementWindow.rowStart,
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
    '--grid-window-offset-x': `${columnOffset(viewport.placementWindow.colStart)}px`,
    '--grid-window-width': `${
      columnOffset(viewport.placementWindow.colEnd + 1) -
      columnOffset(viewport.placementWindow.colStart)
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
        <div className="sheet-grid-frame grid-viewport-frame" style={frameStyle}>
          <button
            className="sheet-corner"
            type="button"
            aria-label="Select all cells"
            aria-pressed={selection.selection.kind === 'all'}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void selectGridHeader({ kind: 'all', sheetId: activeSheet.id })}
          >
            <span aria-hidden="true">◢</span>
          </button>
          <div className="column-headers" role="row">
            {Array.from({ length: activeSheet.colCount }, (_, col) =>
              columnWidths[col] === 0 ? null : (
                <button
                  className={
                    col >= selection.range.colStart && col <= selection.range.colEnd
                      ? 'sheet-heading heading-selected'
                      : 'sheet-heading'
                  }
                  key={col}
                  role="columnheader"
                  type="button"
                  aria-label={`Select column ${String.fromCharCode(65 + col)}`}
                  aria-selected={col >= selection.range.colStart && col <= selection.range.colEnd}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) =>
                    void selectGridHeader({
                      kind: 'column',
                      sheetId: activeSheet.id,
                      index: col,
                      extend: event.shiftKey,
                    })
                  }
                >
                  {String.fromCharCode(65 + col)}
                </button>
              ),
            )}
          </div>
          <div className="row-headers grid-window" style={windowStyle}>
            {rows.map((rowNumber, index) => {
              if (visibleRowHeights[index] === 0) return null
              const row = index + viewport.window.rowStart
              return (
                <button
                  className={
                    row >= selection.range.rowStart && row <= selection.range.rowEnd
                      ? 'sheet-heading heading-selected'
                      : 'sheet-heading'
                  }
                  key={rowNumber}
                  type="button"
                  aria-label={`Select row ${rowNumber}`}
                  aria-pressed={row >= selection.range.rowStart && row <= selection.range.rowEnd}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) =>
                    void selectGridHeader({
                      kind: 'row',
                      sheetId: activeSheet.id,
                      index: row,
                      extend: event.shiftKey,
                    })
                  }
                >
                  {rowNumber}
                </button>
              )
            })}
          </div>
          <div
            ref={events.gridRef}
            className="grid-surface grid-window"
            data-workbook-grid="true"
            onCopy={clipboard.onCopy}
            onCut={clipboard.onCut}
            onPaste={clipboard.onPaste}
            data-row-count={activeSheet.rowCount}
            data-projection-retained={viewport.retained ? 'true' : 'false'}
            aria-busy={viewport.retained}
            aria-label={`${activeSheet.name} cells`}
            onDoubleClick={events.onDoubleClick}
            onKeyDown={events.onKeyDown}
            onPointerCancel={events.onPointerCancel}
            onPointerDown={events.onPointerDown}
            onPointerMove={events.onPointerMove}
            onPointerUp={events.onPointerUp}
            style={cellWindowStyle}
            tabIndex={viewport.retained ? -1 : 0}
          >
            {projectionState(viewport) ?? (
              <SpreadsheetGrid
                cells={viewport.cells}
                selected={selection.range}
                window={viewport.window}
                rowHeights={visibleRowHeights}
                columnWidths={columnWidths.slice(
                  viewport.window.colStart,
                  viewport.window.colEnd + 1,
                )}
              />
            )}
            <CellEditor focusGrid={events.focusGrid} />
          </div>
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
