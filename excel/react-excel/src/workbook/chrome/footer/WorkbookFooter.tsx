import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  selectionSnapshotAtom,
  workbookDocumentAtom,
} from '@einfach/spreadsheet-ui-core'
import './footer.css'

/** Renders sheet tabs and selection status for the active UI-core workbook. */
export function WorkbookFooter() {
  const document = useAtomValue(workbookDocumentAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const selectedCellCount =
    (selection.range.colEnd - selection.range.colStart + 1) *
    (selection.range.rowEnd - selection.range.rowStart + 1)

  return (
    <footer className="workbook-footer">
      <div className="sheet-tabs" aria-label="Workbook sheets">
        <button className="sheet-nav" type="button" aria-label="Previous sheet">
          ‹
        </button>
        <button className="sheet-nav" type="button" aria-label="Next sheet">
          ›
        </button>
        <button className="add-sheet" type="button" aria-label="New sheet">
          ＋
        </button>
        {document.sheets.map((sheet) => (
          <button
            className={sheet.id === activeSheet?.id ? 'sheet-tab active' : 'sheet-tab'}
            key={sheet.id}
            type="button"
          >
            <span aria-hidden="true" /> {sheet.name}
          </button>
        ))}
      </div>
      <div className="status-items">
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
