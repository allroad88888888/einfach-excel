import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  formulaAuditingAvailableAtom,
  runEvaluateFormulaAtom,
  runTraceAuditingAtom,
  runWatchWindowAtom,
  traceArrowsAtom,
  watchWindowPanelAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import type { JSX } from 'react'
import './formula-auditing.css'

export function FormulaAuditingToolbar(): JSX.Element {
  const { t } = useLingui()
  const available = useAtomValue(formulaAuditingAvailableAtom)
  const arrows = useAtomValue(traceArrowsAtom)
  const watchPanel = useAtomValue(watchWindowPanelAtom)
  const runTrace = useSetAtom(runTraceAuditingAtom)
  const runEvaluate = useSetAtom(runEvaluateFormulaAtom)
  const runWatch = useSetAtom(runWatchWindowAtom)

  return (
    <div className="formula-auditing-toolbar" data-formula-auditing-toolbar="true">
      <button
        type="button"
        className="workbook-button ribbon-icon-button"
        disabled={!available}
        data-auditing-action="trace-precedents"
        title={t`Trace Precedents`}
        aria-label={t`Trace Precedents`}
        onClick={() => void runTrace('trace-precedents')}
      >
        <span className="ribbon-button-label">{t`Trace Precedents`}</span>
      </button>
      <button
        type="button"
        className="workbook-button ribbon-icon-button"
        disabled={!available}
        data-auditing-action="trace-dependents"
        title={t`Trace Dependents`}
        aria-label={t`Trace Dependents`}
        onClick={() => void runTrace('trace-dependents')}
      >
        <span className="ribbon-button-label">{t`Trace Dependents`}</span>
      </button>
      <button
        type="button"
        className="workbook-button ribbon-icon-button"
        disabled={arrows.length === 0}
        data-auditing-action="remove-arrows"
        title={t`Remove Arrows`}
        aria-label={t`Remove Arrows`}
        onClick={() => void runTrace('remove-arrows')}
      >
        <span className="ribbon-button-label">{t`Remove Arrows`}</span>
      </button>
      <button
        type="button"
        className="workbook-button ribbon-icon-button"
        disabled={!available}
        data-auditing-action="evaluate-formula"
        title={t`Evaluate Formula`}
        aria-label={t`Evaluate Formula`}
        onClick={() => void runEvaluate('open')}
      >
        <span className="ribbon-button-label">{t`Evaluate Formula`}</span>
      </button>
      <button
        type="button"
        className="workbook-button ribbon-icon-button"
        disabled={!available}
        aria-pressed={watchPanel.open}
        data-auditing-action="watch-window"
        title={t`Watch Window`}
        aria-label={t`Watch Window`}
        onClick={() => void runWatch('toggle')}
      >
        <span className="ribbon-button-label">{t`Watch Window`}</span>
      </button>
    </div>
  )
}
