import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { activeCellFormatAtom, editingSessionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookRibbonItem, preserveWorkbookToolFocus } from '@einfach-excel/react-excel'
import { fontBaselineFeedbackAtom, runFontBaselineAtom } from './core'
import { labels } from './messages'
import './font-baseline.css'

/** Renders whole-cell glyph effects over the plugin's own command feedback. */
export function FontBaselineTools() {
  const { i18n } = useLingui()
  const format = useAtomValue(activeCellFormatAtom)
  const feedback = useAtomValue(fontBaselineFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runFontBaselineAtom)
  return <span className="text-format-tools">
    {(['superscript', 'subscript'] as const).map(value =>
      <WorkbookRibbonItem key={value} id={`format.${value}`}>
        <button type="button" data-ribbon-item={`format.${value}`} className="tool-button"
          aria-label={i18n._(labels[value])} title={i18n._(labels[value])}
          aria-pressed={format.fontBaseline === value} disabled={editing || feedback.busy}
          onClick={event => void preserveWorkbookToolFocus(event.currentTarget, () => run(value))}>
          <span aria-hidden="true">{value === 'superscript' ? 'x²' : 'x₂'}</span>
        </button>
      </WorkbookRibbonItem>)}
    {feedback.busy && <span role="status">{i18n._(labels.applying)}</span>}
    {feedback.error && <span className="font-baseline-feedback" role="alert">
      {i18n._(labels[feedback.error])}
      <button type="button" className="tool-button" aria-label={i18n._(labels.dismiss)}
        onClick={() => void run('dismiss')}>×</button>
    </span>}
  </span>
}
