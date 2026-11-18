import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { activeCellFormatAtom, editingSessionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem, preserveWorkbookToolFocus } from '@einfach-excel/react-excel'
import { runShrinkToFitAtom, shrinkToFitFeedbackAtom, shrinkToFitNoteAtom } from './core'
import { labels } from './messages'
import './font-baseline.css'

export function ShrinkToFitTools() {
  const { i18n } = useLingui()
  const format = useAtomValue(activeCellFormatAtom)
  const feedback = useAtomValue(shrinkToFitFeedbackAtom)
  const note = useAtomValue(shrinkToFitNoteAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runShrinkToFitAtom)
  return <span className="text-format-tools">
    <WorkbookRibbonItem id="format.shrink-to-fit">
      <button type="button" data-ribbon-item="format.shrink-to-fit" className="tool-button"
        aria-label={i18n._(labels.shrinkToFit)} title={i18n._(labels.shrinkToFit)}
        aria-pressed={Boolean(format.shrinkToFit)} disabled={editing || feedback.busy}
        onClick={event => void preserveWorkbookToolFocus(event.currentTarget,
          () => run(!format.shrinkToFit))}><span aria-hidden="true">A↔</span></button>
    </WorkbookRibbonItem>
    {note && <span className="shrink-to-fit-feedback" role="note">{i18n._(labels.shrinkNotApplicable)}</span>}
    {feedback.busy && <span role="status">{i18n._(labels.shrinkApplying)}</span>}
    {feedback.error && <span className="shrink-to-fit-feedback" role="alert">
      {i18n._(feedback.error === 'blocked' ? labels.blocked : labels.shrinkUnconfirmed)}
      <button type="button" className="tool-button" aria-label={i18n._(labels.dismiss)}
        onClick={() => void run('dismiss')}>×</button>
    </span>}
  </span>
}
