import { useAtomValue, useSetAtom } from '@einfach/react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  activeCellFormatAtom, editingSessionAtom, fontBaselineFeedbackAtom, runFontBaselineAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { RibbonItem } from './RibbonItem'
import { preserveToolFocus } from './tool-focus'
import './font-baseline.css'

/** Whole-cell glyph effects; run editing remains in the rich-text dialog. */
export function FontBaselineTools() {
  const { t, i18n } = useLingui()
  const format = useAtomValue(activeCellFormatAtom)
  const feedback = useAtomValue(fontBaselineFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runFontBaselineAtom)
  return <>
    {([
      ['superscript', t`Superscript`, 'x²'],
      ['subscript', t`Subscript`, 'x₂'],
    ] as const).map(([value, label, icon]) => <RibbonItem key={value} id={`format.${value}`}>
      <button
        type="button"
        data-ribbon-item={`format.${value}`}
        className="tool-button"
        aria-label={label}
        title={label}
        aria-pressed={format.fontBaseline === value}
        disabled={editing || feedback.busy}
        onClick={(event) => void preserveToolFocus(event.currentTarget, () => run(value))}
      ><span aria-hidden="true">{icon}</span></button>
    </RibbonItem>)}
    {feedback.busy && <span role="status"><Trans>Applying font baseline…</Trans></span>}
    {feedback.error && <span className="font-baseline-feedback" role="alert">
      {translateFeedback(i18n, feedback.error)}
      <button type="button" className="tool-button" aria-label={t`Dismiss font error`}
        onClick={() => void run('dismiss')}>×</button>
    </span>}
  </>
}
