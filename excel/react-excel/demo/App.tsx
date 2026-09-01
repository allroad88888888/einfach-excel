import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  SpreadsheetUiProvider,
  useSpreadsheetSelection,
} from '@einfach/react-excel'
import { DemoGrid } from './DemoGrid'
import {
  DEMO_COLUMNS,
  DEMO_DATA_ROW_COUNT,
  DEMO_SHEET_ROW_COUNT,
  getDemoFormulaBarValue,
} from './demo-data'
import { FormulaBar } from './FormulaBar'
import { WorkbookFooter } from './WorkbookFooter'
import { WorkbookHeader } from './WorkbookHeader'
import { WorkbookRibbon } from './WorkbookRibbon'

const unsupportedBackendOperation = (): never => {
  throw new Error('The controlled React demo does not invoke backend operations.')
}

const demoBackend: SpreadsheetBackend = Object.freeze({
  readRangeProjection: unsupportedBackendOperation,
  readVisibleProjection: unsupportedBackendOperation,
  setCellInput: unsupportedBackendOperation,
})

const demoStore = createStore()
demoStore.setter(setSelectionBoundsAtom, {
  colCount: DEMO_COLUMNS.length,
  rowCount: DEMO_SHEET_ROW_COUNT,
})

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

function Workbook() {
  const selection = useSpreadsheetSelection()
  const address = selectionLabel(selection.range)
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <div className="workbook">
      <WorkbookHeader />
      <WorkbookRibbon />
      <FormulaBar
        address={address}
        value={getDemoFormulaBarValue(selection.range.rowStart, selection.range.colStart)}
      />
      <DemoGrid />
      <WorkbookFooter
        recordCount={DEMO_DATA_ROW_COUNT}
        selectedCellCount={selectedCellCount}
      />
    </div>
  )
}

/** Composes the standalone React adapter demo. */
export function App() {
  return (
    <SpreadsheetUiProvider backend={demoBackend} store={demoStore}>
      <Workbook />
    </SpreadsheetUiProvider>
  )
}
