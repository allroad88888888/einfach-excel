import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  selectionSnapshotAtom,
  systemClipboardFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import './footer.css'
import { WorkbookSheetTabs } from './WorkbookSheetTabs'

/** Renders sheet tabs and selection status for the active UI-core workbook. */
export function WorkbookFooter() {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <footer className="workbook-footer">
      <WorkbookSheetTabs />
      <div className="status-items">
        {clipboard.message && (
          <div
            className="clipboard-feedback"
            role={clipboard.error ? 'alert' : 'status'}
            aria-label="Clipboard status"
            data-error={clipboard.error}
            title={clipboard.message}
          >
            {clipboard.message}
          </div>
        )}
        {activeSheet === null ? null : (
          <span className="record-status">{activeSheet.rowCount.toLocaleString()} rows</span>
        )}
        <span>Count: {selectedCellCount}</span>
        <div className="zoom-control" aria-label="Zoom 100 percent">
          <button type="button" aria-label="Zoom out">
            −
          </button>
          <span className="zoom-track" aria-hidden="true">
            <span />
          </span>
          <span>100%</span>
          <button type="button" aria-label="Zoom in">
            ＋
          </button>
        </div>
      </div>
    </footer>
  )
}
