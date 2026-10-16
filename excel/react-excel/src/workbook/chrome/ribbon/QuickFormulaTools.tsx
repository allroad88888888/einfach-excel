import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  quickFormulaAvailableAtom, quickFormulaFeedbackAtom, runQuickFormulaAtom,
} from '@einfach/spreadsheet-ui-core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'

const OPTIONS = [['sum', msg`SUM — Total`], ['average', msg`AVERAGE — Mean`], ['count', msg`COUNT — Numbers`]] as const

/** 入口只派发函数选择；公式草稿和焦点由既有公式栏接管。 */
export function QuickFormulaTools() {
  const { i18n, t } = useLingui()
  const run = useSetAtom(runQuickFormulaAtom)
  const available = useAtomValue(quickFormulaAvailableAtom)
  const feedback = useAtomValue(quickFormulaFeedbackAtom)
  return <>
    <button type="button" className="tool-button" aria-label={t`Auto sum`} title={t`Auto sum (review in formula bar)`}
      disabled={!available} onClick={() => void run('sum')}>Σ</button>
    <select className="tool-select paste-options-select" aria-label={t`Quick formula`} value="" disabled={!available}
      onChange={(event) => {
        const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
        if (option) void run(option[0])
      }}>
      <option value="" disabled><Trans>Quick formula</Trans></option>
      {OPTIONS.map(([value, label]) => <option key={value} value={value}>{i18n._(label)}</option>)}
    </select>
    {feedback.busy && <span role="status"><Trans>Finding formula range…</Trans></span>}
    {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
  </>
}
