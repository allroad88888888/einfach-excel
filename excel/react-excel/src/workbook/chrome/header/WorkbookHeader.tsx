import { useAtomValue } from '@einfach/react'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '@einfach/spreadsheet-ui-core'
import './header.css'
import { WorkbookFileTools } from './WorkbookFileTools'
import { Trans, useLingui } from '@lingui/react/macro'
import { LanguageSelect } from './LanguageSelect'

/** Renders identity metadata for the active UI-core workbook. */
export function WorkbookHeader() {
  const { t } = useLingui()
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
        <div className="workbook-subtitle">{activeSheet?.name ?? t`Workbook`}</div>
      </div>
      <div className="header-spacer" />
      <span className="save-state"><Trans>
        In memory
      </Trans></span>
      {activeSheet === null ? null : (
        <span className="row-count-badge"><Trans>{activeSheet.rowCount} rows</Trans></span>
      )}
      <LanguageSelect />
      <WorkbookFileTools />
    </header>
  )
}
