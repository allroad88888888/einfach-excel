import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  selectionSnapshotAtom,
  type WorkbookDocumentSheet,
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
  const gridWindow = useWorkbookGridWindow()
  const viewport = useWorkbookViewport({
    sheetId: activeSheet.id,
    window: gridWindow,
    rowCount: activeSheet.rowCount,
    colCount: activeSheet.colCount,
  })
  const events = useWorkbookGridEvents(viewport)
  const rows = rowNumbers(viewport.window.rowStart, viewport.window.rowEnd)
  const frameStyle = {
    '--grid-column-count': activeSheet.colCount,
    '--grid-column-width': `${WORKBOOK_GRID_COLUMN_WIDTH}px`,
    '--grid-sheet-content-width': `${activeSheet.colCount * WORKBOOK_GRID_COLUMN_WIDTH}px`,
    '--grid-sheet-height': `${(activeSheet.rowCount + 1) * WORKBOOK_GRID_ROW_HEIGHT}px`,
    '--grid-sheet-width': `${
      activeSheet.colCount * WORKBOOK_GRID_COLUMN_WIDTH + WORKBOOK_GRID_ROW_HEADER_WIDTH
    }px`,
  } as CSSProperties
  const windowStyle = {
    '--grid-window-offset': `${viewport.placementWindow.rowStart * WORKBOOK_GRID_ROW_HEIGHT}px`,
  } as CSSProperties
  const cellWindowStyle = {
    ...windowStyle,
    '--grid-window-offset-x': `${viewport.placementWindow.colStart * WORKBOOK_GRID_COLUMN_WIDTH}px`,
    '--grid-window-width': `${
      (viewport.placementWindow.colEnd - viewport.placementWindow.colStart + 1) *
      WORKBOOK_GRID_COLUMN_WIDTH
    }px`,
  } as CSSProperties

  return (
    <section className="worksheet-panel" aria-label={`${activeSheet.name} worksheet`}>
      <div
        ref={events.scrollRef}
        className="sheet-scroll"
        data-testid="sheet-scroll"
        onScroll={events.onScroll}
      >
        <div className="sheet-grid-frame grid-viewport-frame" style={frameStyle}>
          <div className="sheet-corner" aria-hidden="true" />
          <div className="column-headers" role="row">
            {Array.from({ length: activeSheet.colCount }, (_, col) => (
              <div
                className={
                  col >= selection.range.colStart && col <= selection.range.colEnd
                    ? 'sheet-heading heading-selected'
                    : 'sheet-heading'
                }
                key={col}
                role="columnheader"
              >
                {String.fromCharCode(65 + col)}
              </div>
            ))}
          </div>
          <div className="row-headers grid-window" style={windowStyle} aria-hidden="true">
            {rows.map((rowNumber, index) => {
              const row = index + viewport.window.rowStart
              return (
                <div
                  className={
                    row >= selection.range.rowStart && row <= selection.range.rowEnd
                      ? 'sheet-heading heading-selected'
                      : 'sheet-heading'
                  }
                  key={rowNumber}
                >
                  {rowNumber}
                </div>
              )
            })}
          </div>
          <div
            ref={events.gridRef}
            className="grid-surface grid-window"
            data-workbook-grid="true"
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
