import {
  useSpreadsheetSelection,
  useSpreadsheetViewport,
} from '@einfach/react-excel'
import { WorkbookGrid } from './grid/WorkbookGrid'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_RECORD_COUNT,
  SALES_ORDER_SHEET_ROW_COUNT,
} from './data/sales-orders'
import { FormulaBar } from './chrome/FormulaBar'
import { WorkbookFooter } from './chrome/WorkbookFooter'
import { WorkbookHeader } from './chrome/WorkbookHeader'
import { WorkbookRibbon } from './chrome/WorkbookRibbon'
import { useGridWindow } from './projection/use-grid-window'
import './workbook.css'

function columnLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

function selectionLabel(range: {
  colEnd: number
  colStart: number
  rowEnd: number
  rowStart: number
}): string {
  const start = `${columnLabel(range.colStart)}${range.rowStart + 1}`
  const end = `${columnLabel(range.colEnd)}${range.rowEnd + 1}`
  return start === end ? start : `${start}:${end}`
}

/** Composes the Rust-backed projection with the workbook chrome. */
export function Workbook() {
  const selection = useSpreadsheetSelection()
  const gridWindow = useGridWindow()
  const viewport = useSpreadsheetViewport({
    sheetId: 'orders',
    window: gridWindow.window,
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
    onWindowChange: gridWindow.onWindowChange,
  })
  const selectedCell = viewport.cells.find(
    (cell) =>
      cell.row === selection.range.rowStart && cell.col === selection.range.colStart,
  )
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <div className="workbook" data-runtime-state="ready">
      <WorkbookHeader />
      <div className="rust-runtime-status" role="status">Rust/WASM ready</div>
      <WorkbookRibbon />
      <FormulaBar
        address={selectionLabel(selection.range)}
        value={selectedCell?.formula ?? selectedCell?.displayValue ?? ''}
      />
      <WorkbookGrid viewport={viewport} />
      <WorkbookFooter
        recordCount={SALES_ORDER_RECORD_COUNT}
        selectedCellCount={selectedCellCount}
      />
    </div>
  )
}
