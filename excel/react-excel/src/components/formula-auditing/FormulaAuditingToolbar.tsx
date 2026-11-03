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

function AuditingIcon({ kind }: { kind: 'precedents' | 'dependents' | 'clear' | 'evaluate' | 'watch' }) {
  const paths = {
    precedents: 'M2 3h6v6H2z M16 15h6v6h-6z M8 6h5v12h3 M13 15l3 3-3 3',
    dependents: 'M2 3h6v6H2z M16 15h6v6h-6z M16 18h-5V6H8 M11 3 8 6l3 3',
    clear: 'M3 6h12m-3-3 3 3-3 3 M21 18H9m3-3-3 3 3 3 M3 21 21 3',
    evaluate: 'M13 5H9L6 19H3 M4 10h8 M14 13l6 6m0-6-6 6',
    watch: 'M3 4h18v15H3z M8 22h8 M12 19v3 M6 11.5s2.5-3.5 6-3.5 6 3.5 6 3.5-2.5 3.5-6 3.5-6-3.5-6-3.5Z',
  }
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[kind]} />
    {kind === 'watch' && <circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />}
  </svg>
}

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
        className="tool-button"
        disabled={!available}
        data-auditing-action="trace-precedents"
        title={t`Trace Precedents`}
        aria-label={t`Trace Precedents`}
        onClick={() => void runTrace('trace-precedents')}
      >
        <AuditingIcon kind="precedents" />
      </button>
      <button
        type="button"
        className="tool-button"
        disabled={!available}
        data-auditing-action="trace-dependents"
        title={t`Trace Dependents`}
        aria-label={t`Trace Dependents`}
        onClick={() => void runTrace('trace-dependents')}
      >
        <AuditingIcon kind="dependents" />
      </button>
      <button
        type="button"
        className="tool-button"
        disabled={arrows.length === 0}
        data-auditing-action="remove-arrows"
        title={t`Remove Arrows`}
        aria-label={t`Remove Arrows`}
        onClick={() => void runTrace('remove-arrows')}
      >
        <AuditingIcon kind="clear" />
      </button>
      <button
        type="button"
        className="tool-button"
        disabled={!available}
        data-auditing-action="evaluate-formula"
        title={t`Evaluate Formula`}
        aria-label={t`Evaluate Formula`}
        onClick={() => void runEvaluate('open')}
      >
        <AuditingIcon kind="evaluate" />
      </button>
      <button
        type="button"
        className="tool-button"
        disabled={!available}
        aria-pressed={watchPanel.open}
        data-auditing-action="watch-window"
        title={t`Watch Window`}
        aria-label={t`Watch Window`}
        onClick={() => void runWatch('toggle')}
      >
        <AuditingIcon kind="watch" />
      </button>
    </div>
  )
}
