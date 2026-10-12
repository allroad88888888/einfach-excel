import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  formatPainterAtom,
  selectionCellCountAtom,
  selectionRegionsAtom,
  selectionMutationFeedbackAtom,
  systemClipboardFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import './footer.css'
import { WorkbookSheetTabs } from './WorkbookSheetTabs'
import { SelectionStatus } from './SelectionStatus'

/** Renders sheet tabs and selection status for the active UI-core workbook. */
export function WorkbookFooter() {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selectedCellCount = useAtomValue(selectionCellCountAtom)
  const multiple = useAtomValue(selectionRegionsAtom).length > 1
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const painting = useAtomValue(formatPainterAtom).mode !== 'idle'
  const mutation = useAtomValue(selectionMutationFeedbackAtom)

  return (
    <footer className="workbook-footer">
      {mutation.error && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label="Selection change error">{mutation.error}</div>}
      {mutation.busy && <span className="visually-hidden" role="status">Updating selection…</span>}
      {multiple && <div className="selection-limit-note" role="status" aria-label="Multi-area selection">
        {selectedCellCount} cells selected in multiple areas.{' '}
        Clear and formatting apply to all areas. Borders require one continuous range.
      </div>}
      <WorkbookSheetTabs />
      <div className="status-items">
        {clipboard.message && !painting && (
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
        <span>Selected: {selectedCellCount}</span>
        <SelectionStatus />
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
