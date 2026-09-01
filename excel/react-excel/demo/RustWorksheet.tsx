import {
  useSpreadsheetSelection,
  useSpreadsheetViewport,
} from '@einfach/react-excel'
import { DemoGrid } from './DemoGrid'
import {
  DEMO_COLUMNS,
  DEMO_DATA_ROW_COUNT,
  DEMO_SHEET_ROW_COUNT,
} from './demo-data'
import { FormulaBar } from './FormulaBar'
import { WorkbookFooter } from './WorkbookFooter'
import { WorkbookHeader } from './WorkbookHeader'
import { WorkbookRibbon } from './WorkbookRibbon'
import { useDemoGridWindow } from './use-demo-grid-window'

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

/** Composes the Rust-backed projection with the demo workbook chrome. */
export function RustWorksheet() {
  const selection = useSpreadsheetSelection()
  const gridWindow = useDemoGridWindow()
  const viewport = useSpreadsheetViewport({
    sheetId: 'orders',
    window: gridWindow.window,
    rowCount: DEMO_SHEET_ROW_COUNT,
    colCount: DEMO_COLUMNS.length,
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
      <DemoGrid viewport={viewport} />
      <WorkbookFooter
        recordCount={DEMO_DATA_ROW_COUNT}
        selectedCellCount={selectedCellCount}
      />
    </div>
  )
}
