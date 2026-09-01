import type { CellCoord } from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetGridView,
  useSpreadsheetSelection,
} from '@einfach/react-excel'
import { useSpreadsheetPointerSelection } from '@einfach/react-excel/pointer-selection'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  DEMO_CELLS,
  DEMO_COLUMNS,
  DEMO_SHEET_ROW_COUNT,
} from './demo-data'

const GRID_WINDOW = Object.freeze({
  colStart: 0,
  colEnd: DEMO_COLUMNS.length - 1,
  rowStart: 0,
  rowEnd: DEMO_SHEET_ROW_COUNT - 1,
})
const ROW_NUMBERS = Object.freeze(
  Array.from({ length: DEMO_SHEET_ROW_COUNT }, (_, row) => row + 1),
)

function coordinateAt(event: ReactPointerEvent<HTMLElement>): CellCoord | null {
  const target = document.elementFromPoint(event.clientX, event.clientY)
  const cell = target?.closest<HTMLElement>('td[data-cell]')
  const [row, col] = cell?.dataset.cell?.split(':').map(Number) ?? []

  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

/** Renders the selectable 1,000-row controlled projection. */
export function DemoGrid() {
  const selection = useSpreadsheetSelection()
  const pointerHandlers = useSpreadsheetPointerSelection({
    getCellCoord: coordinateAt,
    sheetId: 'orders',
  })

  return (
    <section className="worksheet-panel" aria-label="Sales orders worksheet">
      <div className="sheet-scroll">
        <div className="sheet-grid-frame">
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
          <div className="row-headers" aria-hidden="true">
            {ROW_NUMBERS.map((rowNumber, row) => (
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
            ))}
          </div>
          <div
            className="grid-surface"
            data-row-count={DEMO_SHEET_ROW_COUNT}
            aria-label="One thousand sales order records"
            {...pointerHandlers}
          >
            <SpreadsheetGridView
              cells={DEMO_CELLS}
              selected={selection.range}
              window={GRID_WINDOW}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
