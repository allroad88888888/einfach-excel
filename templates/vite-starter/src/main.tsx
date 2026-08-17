import { render } from 'solid-js/web'
import {
  createWorkerWorkbookSpreadsheetBackend,
  SpreadsheetGrid,
  SpreadsheetUiProvider,
} from '@einfach/solid-excel/vnext'
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/vnext-worker-factory'
import '@einfach/solid-excel/vnext-styles.css'

const backend = createWorkerWorkbookSpreadsheetBackend({
  workerFactory: defaultVNextWorkbookWorkerFactory,
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
})
const viewport = { scrollTop: 0, scrollLeft: 0, viewportHeight: 480, viewportWidth: 960,
  rowHeight: 24, colWidth: 96, rowCount: 50, colCount: 12, overscanRows: 2, overscanCols: 1 }
render(() => (
  <SpreadsheetUiProvider backend={backend}>
    <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
  </SpreadsheetUiProvider>
), document.getElementById('root')!)
