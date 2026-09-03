import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
import {
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUiEvent,
} from 'react'
import { CellEditor } from '../editor/CellEditor'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../product/sales-orders/data/sheet'
import { GRID_ROW_HEIGHT, useGridWindow } from '../../projection/use-grid-window'
import { useWorkbookViewport, type WorkbookViewport } from '../../projection/use-workbook-viewport'
import { useGridPointerSelection } from '../../selection/use-grid-pointer-selection'
import { SpreadsheetGrid } from '../cells/SpreadsheetGrid'
import './grid.css'

function coordinateAt(
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
): CellCoord | null {
  const eventCell =
    event.target instanceof Element ? event.target.closest<HTMLElement>('td[data-cell]') : null
  const pointCell = document
    .elementFromPoint?.(event.clientX, event.clientY)
    ?.closest<HTMLElement>('td[data-cell]')
  const [row, col] = (eventCell ?? pointCell)?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

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

/** Renders only the Rust projection for the current selectable row window. */
export function WorkbookGrid() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const editingSession = useAtomValue(editingSessionAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const gridWindow = useGridWindow()
  const viewport = useWorkbookViewport({
    sheetId: 'orders',
    window: gridWindow,
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
  })
  const gridRef = useRef<HTMLDivElement>(null)
  const focusGrid = useCallback(() => gridRef.current?.focus({ preventScroll: true }), [])
  const pointerHandlers = useGridPointerSelection({
    enabled: !viewport.retained,
    getCellCoord: coordinateAt,
    sheetId: 'orders',
  })
  const rows = rowNumbers(viewport.window.rowStart, viewport.window.rowEnd)
  const frameStyle = {
    '--grid-sheet-height': `${(SALES_ORDER_SHEET_ROW_COUNT + 1) * GRID_ROW_HEIGHT}px`,
  } as CSSProperties
  const windowStyle = {
    '--grid-window-offset': `${viewport.placementWindow.rowStart * GRID_ROW_HEIGHT}px`,
  } as CSSProperties

  const onScroll = (event: ReactUiEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
    const rowStart =
      maxScrollTop > 0 && scrollTop >= maxScrollTop - 1
        ? SALES_ORDER_SHEET_ROW_COUNT - (viewport.window.rowEnd - viewport.window.rowStart + 1)
        : Math.floor(scrollTop / GRID_ROW_HEIGHT)
    viewport.scrollTo(rowStart, 0)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (viewport.retained) return
    if (event.key !== 'Enter' || editingSession.source !== null) return
    event.preventDefault()
    startCellEditing({
      sheetId: 'orders',
      cell: { row: selection.activeCell.row, col: selection.activeCell.col },
    })
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewport.retained) return
    event.currentTarget.focus({ preventScroll: true })
    pointerHandlers.onPointerDown(event)
  }

  return (
    <section className="worksheet-panel" aria-label="Sales orders worksheet">
      <div className="sheet-scroll" data-testid="sheet-scroll" onScroll={onScroll}>
        <div className="sheet-grid-frame grid-viewport-frame" style={frameStyle}>
          <div className="sheet-corner" aria-hidden="true" />
          <div className="column-headers" role="row">
            {SALES_ORDER_COLUMNS.map((column, col) => (
              <div
                className={
                  col >= selection.range.colStart && col <= selection.range.colEnd
                    ? 'sheet-heading heading-selected'
                    : 'sheet-heading'
                }
                key={column.key}
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
            ref={gridRef}
            className="grid-surface grid-window"
            data-row-count={SALES_ORDER_SHEET_ROW_COUNT}
            data-projection-retained={viewport.retained ? 'true' : 'false'}
            aria-busy={viewport.retained}
            aria-label="One thousand sales order records"
            onDoubleClick={(event) => {
              if (viewport.retained) return
              const cell = coordinateAt(event)
              if (cell !== null) startCellEditing({ sheetId: 'orders', cell })
            }}
            onKeyDown={onKeyDown}
            style={windowStyle}
            tabIndex={viewport.retained ? -1 : 0}
            {...pointerHandlers}
            onPointerDown={onPointerDown}
          >
            {projectionState(viewport) ?? (
              <SpreadsheetGrid
                cells={viewport.cells}
                selected={selection.range}
                window={viewport.window}
              />
            )}
            <CellEditor focusGrid={focusGrid} />
          </div>
        </div>
      </div>
    </section>
  )
}
