import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  calculationAvailableAtom, calculationFeedbackAtom, recalculateAtom,
  formulaViewAvailableAtom, showFormulasAtom, toggleFormulaViewAtom,
} from '@einfach/spreadsheet-ui-core'

/** 计算范围由用户选择；显示公式是独立的当前表视图开关。 */
export function CalculationTools() {
  const calculate = useSetAtom(recalculateAtom)
  const available = useAtomValue(calculationAvailableAtom)
  const feedback = useAtomValue(calculationFeedbackAtom)
  const show = useAtomValue(showFormulasAtom)
  const toggle = useSetAtom(toggleFormulaViewAtom)
  const viewAvailable = useAtomValue(formulaViewAvailableAtom)
  return <>
    <select className="paste-options-select" aria-label="Recalculate" value="" disabled={!available}
      onChange={(event) => {
        const scope = event.currentTarget.value
        if (scope === 'sheet' || scope === 'workbook') void calculate(scope)
      }}>
      <option value="" disabled>Recalculate</option>
      <option value="sheet">Current worksheet</option>
      <option value="workbook">Entire workbook</option>
    </select>
    <button type="button" className="tool-button" aria-label="Show formulas" title="Show formulas"
      aria-pressed={show} disabled={!viewAvailable} onClick={() => toggle()}>=</button>
    {feedback.busy && <span role="status">Recalculating…</span>}
    {!feedback.busy && feedback.message && <span role="status">{feedback.message}</span>}
    {feedback.error && <span role="alert">{feedback.error}</span>}
  </>
}
