import { RibbonItem } from './RibbonItem'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  calculationAvailableAtom,
  calculationFeedbackAtom,
  calculationModeAtom,
  iterativeCalculationAtom,
  recalculateAtom,
  setCalculationModeAtom,
  setIterativeCalculationAtom,
  formulaViewAvailableAtom,
  showFormulasAtom,
  toggleFormulaViewAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { Trans, useLingui } from '@lingui/react/macro'
import './calculation-tools.css'

/** 计算模式与计算范围由用户选择；显示公式是独立的当前表视图开关。 */
export function CalculationTools() {
  const { i18n, t } = useLingui()
  const calculate = useSetAtom(recalculateAtom)
  const mode = useAtomValue(calculationModeAtom)
  const setMode = useSetAtom(setCalculationModeAtom)
  const iterative = useAtomValue(iterativeCalculationAtom)
  const setIterative = useSetAtom(setIterativeCalculationAtom)
  const available = useAtomValue(calculationAvailableAtom)
  const feedback = useAtomValue(calculationFeedbackAtom)
  const show = useAtomValue(showFormulasAtom)
  const toggle = useSetAtom(toggleFormulaViewAtom)
  const viewAvailable = useAtomValue(formulaViewAvailableAtom)
  return (
    <>
      <RibbonItem id="calculation.calculation-mode">
        <select
          data-ribbon-item="calculation.calculation-mode"
          className="tool-select calculation-mode-select"
          aria-label={t`Calculation mode`}
          value={mode}
          disabled={!available}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (next === 'automatic' || next === 'manual') void setMode(next)
          }}
        >
          <option value="automatic">
            <Trans>Automatic</Trans>
          </option>
          <option value="manual">
            <Trans>Manual</Trans>
          </option>
        </select>
      </RibbonItem>
      <RibbonItem id="calculation.recalculate">
        <select
          data-ribbon-item="calculation.recalculate"
          className="tool-select calculation-recalculate-select"
          aria-label={t`Recalculate`}
          value=""
          disabled={!available}
          onChange={(event) => {
            const scope = event.currentTarget.value
            if (scope === 'sheet' || scope === 'workbook') void calculate(scope)
          }}
        >
          <option value="" disabled>
            <Trans>Recalculate</Trans>
          </option>
          <option value="sheet">
            <Trans>Current worksheet</Trans>
          </option>
          <option value="workbook">
            <Trans>Entire workbook</Trans>
          </option>
        </select>
      </RibbonItem>
      <RibbonItem id="calculation.iterative-calculation">
        <button
          data-ribbon-item="calculation.iterative-calculation"
          type="button"
          className="tool-button calculation-iteration-toggle"
          data-testid="iterative-calculation-toggle"
          aria-label={t`Iterative calculation`}
          title={t`Iterative calculation`}
          aria-pressed={iterative.enabled}
          disabled={!available}
          onClick={() => void setIterative({ ...iterative, enabled: !iterative.enabled })}
        >
          <span aria-hidden="true">↻</span>
          <Trans>Iterative</Trans>
        </button>
      </RibbonItem>
      <RibbonItem id="calculation.max-iterations">
        <label data-ribbon-item="calculation.max-iterations" className="calculation-parameter">
          <span>
            <Trans>Max iterations</Trans>
          </span>
          <input
            type="number"
            className="calculation-parameter-input"
            data-testid="iterative-max-iterations"
            aria-label={t`Max iterations`}
            title={t`Max iterations`}
            min={1}
            max={32767}
            step={1}
            defaultValue={iterative.maxIterations}
            disabled={!available}
            onChange={(event) => {
              const raw = event.currentTarget.value.trim()
              if (!raw) return
              const next = Number(raw)
              if (Number.isFinite(next) && next >= 1) {
                void setIterative({ ...iterative, maxIterations: Math.trunc(next) })
              }
            }}
          />
        </label>
      </RibbonItem>
      <RibbonItem id="calculation.max-change">
        <label data-ribbon-item="calculation.max-change" className="calculation-parameter">
          <span>
            <Trans>Max change</Trans>
          </span>
          <input
            type="number"
            className="calculation-parameter-input calculation-change-input"
            data-testid="iterative-max-change"
            aria-label={t`Max change`}
            title={t`Max change`}
            min={0}
            step="any"
            defaultValue={iterative.maxChange}
            disabled={!available}
            onChange={(event) => {
              const raw = event.currentTarget.value.trim()
              if (!raw) return
              const next = Number(raw)
              if (Number.isFinite(next) && next >= 0) {
                void setIterative({ ...iterative, maxChange: next })
              }
            }}
          />
        </label>
      </RibbonItem>
      <RibbonItem id="calculation.show-formulas">
        <button
          data-ribbon-item="calculation.show-formulas"
          type="button"
          className="tool-button"
          aria-label={t`Show formulas`}
          title={t`Show formulas`}
          aria-pressed={show}
          disabled={!viewAvailable}
          onClick={() => toggle()}
        >
          =
        </button>
      </RibbonItem>
      {feedback.busy && (
        <span className="calculation-feedback" role="status">
          <Trans>Recalculating…</Trans>
        </span>
      )}
      {!feedback.busy && feedback.message && (
        <span className="calculation-feedback" role="status">
          {translateFeedback(i18n, feedback.message)}
        </span>
      )}
      {feedback.error && (
        <span className="calculation-feedback" role="alert">
          {translateFeedback(i18n, feedback.error)}
        </span>
      )}
    </>
  )
}
