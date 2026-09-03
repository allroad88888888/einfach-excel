import { useAtomValue } from '@einfach/react'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '@einfach/spreadsheet-ui-core'
import './header.css'

/** Renders identity metadata for the active UI-core workbook. */
export function WorkbookHeader() {
  const document = useAtomValue(workbookDocumentAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)

  return (
    <header className="workbook-header">
      <div className="univer-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="workbook-identity">
        <div className="workbook-name">{document.title}</div>
        <div className="workbook-subtitle">{activeSheet?.name ?? 'Workbook'}</div>
      </div>
      <div className="header-spacer" />
      <span className="save-state">
        <span aria-hidden="true">✓</span> Saved locally
      </span>
      {activeSheet === null ? null : (
        <span className="row-count-badge">{activeSheet.rowCount.toLocaleString()} rows</span>
      )}
      <div className="header-actions">
        <button type="button" aria-label="More workbook options">
          •••
        </button>
      </div>
    </header>
  )
}
