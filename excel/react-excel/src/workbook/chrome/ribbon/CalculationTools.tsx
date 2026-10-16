import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  calculationAvailableAtom, calculationFeedbackAtom, recalculateAtom,
  formulaViewAvailableAtom, showFormulasAtom, toggleFormulaViewAtom,
} from '@einfach/spreadsheet-ui-core'
import { Trans, useLingui } from '@lingui/react/macro'

/** 计算范围由用户选择；显示公式是独立的当前表视图开关。 */
export function CalculationTools() {
  const { i18n, t } = useLingui()
  const calculate = useSetAtom(recalculateAtom)
  const available = useAtomValue(calculationAvailableAtom)
  const feedback = useAtomValue(calculationFeedbackAtom)
  const show = useAtomValue(showFormulasAtom)
  const toggle = useSetAtom(toggleFormulaViewAtom)
  const viewAvailable = useAtomValue(formulaViewAvailableAtom)
  return <>
    <select className="tool-select paste-options-select" aria-label={t`Recalculate`} value="" disabled={!available}
      onChange={(event) => {
        const scope = event.currentTarget.value
        if (scope === 'sheet' || scope === 'workbook') void calculate(scope)
      }}>
      <option value="" disabled><Trans>Recalculate</Trans></option>
      <option value="sheet"><Trans>Current worksheet</Trans></option>
      <option value="workbook"><Trans>Entire workbook</Trans></option>
    </select>
    <button type="button" className="tool-button" aria-label={t`Show formulas`} title={t`Show formulas`}
      aria-pressed={show} disabled={!viewAvailable} onClick={() => toggle()}>=</button>
    {feedback.busy && <span role="status"><Trans>Recalculating…</Trans></span>}
    {!feedback.busy && feedback.message && <span role="status">{translateFeedback(i18n, feedback.message)}</span>}
    {feedback.error && <span role="alert">{translateFeedback(i18n, feedback.error)}</span>}
  </>
}
