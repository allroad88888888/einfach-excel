import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  formatPainterAtom,
  multiRangeSelectionFeedbackAtom,
  selectionCellCountAtom,
  selectionRegionsAtom,
  selectionMutationFeedbackAtom,
  systemClipboardFeedbackAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import './footer.css'
import { WorkbookSheetTabs } from './WorkbookSheetTabs'
import { SelectionStatus } from './SelectionStatus'
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

  return (
    <footer className="workbook-footer">
      {selectionError && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label={t`Selection change error`}>{translateFeedback(i18n, selectionError)}</div>}
      {mutation.error && <div className="selection-limit-note sheet-command-error"
        role="alert" aria-label={t`Selection change error`}>{translateFeedback(i18n, mutation.error)}</div>}
      {mutation.busy && <span className="visually-hidden" role="status"><Trans>Updating selection…</Trans></span>}
      {multiple && <div className="selection-limit-note" role="status" aria-label={t`Multi-area selection`}><Trans>
        {selectedCellCount} cells selected in multiple areas.
        Clear and formatting apply to all areas. Borders require one continuous range.
      </Trans></div>}
      <WorkbookSheetTabs />
      <div className="status-items">
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
        <div className="zoom-control" aria-label={t`Zoom 100 percent`}>
          <button type="button" aria-label={t`Zoom out`}>
            −
          </button>
          <span className="zoom-track" aria-hidden="true">
            <span />
          </span>
          <span>100%</span>
          <button type="button" aria-label={t`Zoom in`}>
            ＋
          </button>
        </div>
      </div>
    </footer>
  )
}
