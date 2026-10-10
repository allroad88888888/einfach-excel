import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  quickFormulaAvailableAtom, quickFormulaFeedbackAtom, runQuickFormulaAtom,
} from '@einfach/spreadsheet-ui-core'

const OPTIONS = [['sum', 'SUM — Total'], ['average', 'AVERAGE — Mean'], ['count', 'COUNT — Numbers']] as const

/** 入口只派发函数选择；公式草稿和焦点由既有公式栏接管。 */
export function QuickFormulaTools() {
  const run = useSetAtom(runQuickFormulaAtom)
  const available = useAtomValue(quickFormulaAvailableAtom)
  const feedback = useAtomValue(quickFormulaFeedbackAtom)
  return <>
    <button type="button" className="tool-button" aria-label="Auto sum" title="Auto sum (review in formula bar)"
      disabled={!available} onClick={() => void run('sum')}>Σ</button>
    <select className="paste-options-select" aria-label="Quick formula" value="" disabled={!available}
      onChange={(event) => {
        const option = OPTIONS.find(([value]) => value === event.currentTarget.value)
        if (option) void run(option[0])
      }}>
      <option value="" disabled>Quick formula</option>
      {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {feedback.busy && <span role="status">Finding formula range…</span>}
    {feedback.error && <span role="alert">{feedback.error}</span>}
  </>
}
