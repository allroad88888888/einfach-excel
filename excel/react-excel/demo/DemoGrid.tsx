import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetGridView,
  useSpreadsheetSelection,
  type UseSpreadsheetViewportResult,
} from '@einfach/react-excel'
import { useSpreadsheetPointerSelection } from '@einfach/react-excel/pointer-selection'
import {
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUiEvent,
} from 'react'
import { DemoCellEditor } from './DemoCellEditor'
import { DEMO_COLUMNS, DEMO_SHEET_ROW_COUNT } from './demo-data'
import { useDemoCellEdit } from './use-demo-cell-edit'
import { DEMO_GRID_ROW_HEIGHT } from './use-demo-grid-window'
import './grid-viewport.css'

export interface DemoGridProps {
  readonly viewport: UseSpreadsheetViewportResult
}

function coordinateAt(
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
): CellCoord | null {
  const eventCell =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('td[data-cell]')
      : null
  const pointCell = document
    .elementFromPoint?.(event.clientX, event.clientY)
    ?.closest<HTMLElement>('td[data-cell]')
  const [row, col] = (eventCell ?? pointCell)?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function rowNumbers(rowStart: number, rowEnd: number): readonly number[] {
  return Array.from({ length: rowEnd - rowStart + 1 }, (_, index) => rowStart + index + 1)
}

function projectionState(viewport: UseSpreadsheetViewportResult) {
  if (viewport.status === 'error') {
    return <div className="grid-projection-state" role="alert">{viewport.error?.message}</div>
  }
  if (viewport.status !== 'ready') {
    return <div className="grid-projection-state" role="status">Loading visible cells…</div>
  }
  return null
}

/** Renders only the Rust projection for the current selectable row window. */
export function DemoGrid({ viewport }: DemoGridProps) {
  const selection = useSpreadsheetSelection()
  const cellEdit = useDemoCellEdit(viewport)
  const gridRef = useRef<HTMLDivElement>(null)
  const focusGrid = useCallback(() => gridRef.current?.focus({ preventScroll: true }), [])
  const pointerHandlers = useSpreadsheetPointerSelection({
    getCellCoord: coordinateAt,
    sheetId: 'orders',
  })
  const rows = rowNumbers(viewport.window.rowStart, viewport.window.rowEnd)
  const frameStyle = {
    '--grid-sheet-height': `${(DEMO_SHEET_ROW_COUNT + 1) * DEMO_GRID_ROW_HEIGHT}px`,
  } as CSSProperties
  const windowStyle = {
    '--grid-window-offset': `${viewport.window.rowStart * DEMO_GRID_ROW_HEIGHT}px`,
  } as CSSProperties

  const onScroll = (event: ReactUiEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
    const rowStart =
      maxScrollTop > 0 && scrollTop >= maxScrollTop - 1
        ? DEMO_SHEET_ROW_COUNT - (viewport.window.rowEnd - viewport.window.rowStart + 1)
        : Math.floor(scrollTop / DEMO_GRID_ROW_HEIGHT)
    viewport.scrollTo(rowStart, 0)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || cellEdit.activeCell !== null) return
    event.preventDefault()
    cellEdit.start({ row: selection.activeCell.row, col: selection.activeCell.col })
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus({ preventScroll: true })
    pointerHandlers.onPointerDown(event)
  }

  return (
    <section className="worksheet-panel" aria-label="Sales orders worksheet">
      <div className="sheet-scroll" data-testid="sheet-scroll" onScroll={onScroll}>
        <div className="sheet-grid-frame grid-viewport-frame" style={frameStyle}>
          <div className="sheet-corner" aria-hidden="true" />
          <div className="column-headers" role="row">
            {DEMO_COLUMNS.map((column, col) => (
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
            data-row-count={DEMO_SHEET_ROW_COUNT}
            aria-label="One thousand sales order records"
            onDoubleClick={(event) => {
              const cell = coordinateAt(event)
              if (cell !== null) cellEdit.start(cell)
            }}
            onKeyDown={onKeyDown}
            style={windowStyle}
            tabIndex={0}
            {...pointerHandlers}
            onPointerDown={onPointerDown}
          >
            {projectionState(viewport) ?? (
              <SpreadsheetGridView
                cells={viewport.cells}
                selected={selection.range}
                window={viewport.window}
              />
            )}
            <DemoCellEditor
              edit={cellEdit}
              focusGrid={focusGrid}
              rowStart={viewport.window.rowStart}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
