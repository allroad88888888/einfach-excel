import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  dragMoveFeedbackAtom,
  formatPainterAtom,
  multiRangeSelectionFeedbackAtom,
  selectionCellCountAtom,
  selectionRegionsAtom,
  selectionMutationFeedbackAtom,
  systemClipboardFeedbackAtom,
  workbookFilePanelAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import './footer.css'
import { WorkbookSheetTabs } from './WorkbookSheetTabs'
import { SelectionStatus } from './SelectionStatus'
import { ZoomControl } from '../../zoom/ZoomControl'
import { Trans, useLingui } from '@lingui/react/macro'

/** Renders sheet tabs and selection status for the active UI-core workbook. */
export function WorkbookFooter() {
  const { i18n, t } = useLingui()
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const selectedCellCount = useAtomValue(selectionCellCountAtom)
  const multiple = useAtomValue(selectionRegionsAtom).length > 1
  const clipboard = useAtomValue(systemClipboardFeedbackAtom)
  const painting = useAtomValue(formatPainterAtom).mode !== 'idle'
  const mutation = useAtomValue(selectionMutationFeedbackAtom)
  const selectionError = useAtomValue(multiRangeSelectionFeedbackAtom)
  const dragMove = useAtomValue(dragMoveFeedbackAtom)
  const filePanel = useAtomValue(workbookFilePanelAtom)
  const fileNotice = !filePanel.open && !filePanel.busy && !filePanel.error ? filePanel.message : ''

  return (
    <footer className="workbook-footer">
      {selectionError && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label={t`Selection change error`}>{translateFeedback(i18n, selectionError)}</div>}
      {mutation.error && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label={t`Selection change error`}>{translateFeedback(i18n, mutation.error)}</div>}
      {dragMove.error && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label={t`Move cells error`}>{translateFeedback(i18n, dragMove.error)}</div>}
      {mutation.busy && <span className="visually-hidden" role="status"><Trans>Updating selection…</Trans></span>}
      {multiple && <div className="selection-limit-note" role="status" aria-label={t`Multi-area selection`}><Trans>
        {selectedCellCount} cells selected in multiple areas.
        Clear and formatting apply to all areas. Borders require one continuous range.
      </Trans></div>}
      <WorkbookSheetTabs />
      <div className="status-items">
        {fileNotice && !clipboard.message && !painting && (
          <div
            className="clipboard-feedback"
            role="status"
            aria-label={t`Workbook file status`}
            title={translateFeedback(i18n, fileNotice)}
          >
            {translateFeedback(i18n, fileNotice)}
          </div>
        )}
        {clipboard.message && !painting && (
          <div
            className="clipboard-feedback"
            role={clipboard.error ? 'alert' : 'status'}
            aria-label={t`Clipboard status`}
            data-error={clipboard.error}
            title={translateFeedback(i18n, clipboard.message)}
          >
            {translateFeedback(i18n, clipboard.message)}
          </div>
        )}
        {activeSheet === null ? null : (
          <span className="record-status"><Trans>{activeSheet.rowCount} rows</Trans></span>
        )}
        <span><Trans>Selected: {selectedCellCount}</Trans></span>
        <SelectionStatus />
        <ZoomControl />
      </div>
    </footer>
  )
}
