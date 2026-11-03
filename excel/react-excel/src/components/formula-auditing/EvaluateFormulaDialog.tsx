import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  evaluateFormulaDialogAtom,
  runEvaluateFormulaAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import { useLayoutEffect, useRef, type JSX } from 'react'
import { cycleDialogFocus } from '../../workbook/chrome/ribbon/dialog-focus'
import './formula-auditing.css'
import './evaluate-formula.css'

export function EvaluateFormulaDialog(): JSX.Element | null {
  const { t } = useLingui()
  const dialog = useAtomValue(evaluateFormulaDialogAtom)
  const runEvaluate = useSetAtom(runEvaluateFormulaAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const element = dialogRef.current
    if (!dialog.open || !element) return
    const opener = document.activeElement
    if (element.showModal) element.showModal()
    else element.setAttribute('open', '')
    element.querySelector<HTMLButtonElement>('[data-evaluate-action="evaluate"]:enabled')?.focus()
    return () => {
      element.close?.()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [dialog.open])

  if (!dialog.open) return null

  const trace = dialog.trace
  const expr = dialog.currentExpression
  const span = dialog.focusSpan
  const hasValidSpan =
    span !== null && span.start >= 0 && span.end > span.start && span.end <= expr.length

  const prefix = hasValidSpan && span ? expr.slice(0, span.start) : expr
  const focused = hasValidSpan && span ? expr.slice(span.start, span.end) : ''
  const suffix = hasValidSpan && span ? expr.slice(span.end) : ''

  return (
    <dialog
      ref={dialogRef}
      className="evaluate-formula-dialog"
      data-evaluate-formula-dialog="true"
      aria-modal="true"
      aria-label={t`Evaluate Formula`}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => { event.preventDefault(); void runEvaluate('close') }}
    >
      <div className="evaluate-formula-header">
        <h2>{t`Evaluate Formula`}</h2>
        <button
          type="button"
          className="auditing-panel-button auditing-panel-close"
          aria-label={t`Close`}
          title={t`Close`}
          data-evaluate-action="close"
          onClick={() => void runEvaluate('close')}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {trace ? (
        <div className="evaluate-formula-meta">
          <span data-evaluate-reference="true">
            {t`Reference`}: <strong>{`${trace.sheetName}!${trace.addr}`}</strong>
          </span>
          {dialog.stack.length > 0 ? (
            <span data-evaluate-stack-depth={String(dialog.stack.length)}>
              {t`Stepped In`} ({dialog.stack.length})
            </span>
          ) : (
            <span>
              {trace.steps.length > 0
                ? `${Math.min(dialog.stepIndex + 1, trace.steps.length)} / ${trace.steps.length}`
                : t`Result`}
            </span>
          )}
        </div>
      ) : null}

      <div className="evaluate-formula-box" data-evaluate-expression="true">
        {hasValidSpan ? (
          <>
            <span>{prefix}</span>
            <u className="evaluate-formula-focus" data-evaluate-focus="true">
              {focused}
            </u>
            <span>{suffix}</span>
          </>
        ) : (
          <span>{expr}</span>
        )}
      </div>

      {dialog.currentStep ? (
        <div className="evaluate-formula-step-preview" data-evaluate-step-preview="true">
          <span>{t`Next step result`}:</span>
          <strong>{dialog.currentStep.stepResult}</strong>
        </div>
      ) : trace ? (
        <div className="evaluate-formula-step-preview" data-evaluate-final-result="true">
          <span>{t`Final result`}:</span>
          <strong>{trace.finalResult}</strong>
        </div>
      ) : null}

      {dialog.error ? <div className="auditing-panel-error" role="alert">{dialog.error}</div> : null}

      <div className="evaluate-formula-actions">
        <button
          type="button"
          className="auditing-panel-button auditing-panel-primary"
          data-evaluate-action="evaluate"
          disabled={!dialog.canEvaluate}
          onClick={() => void runEvaluate('evaluate')}
        >
          {t`Evaluate`}
        </button>
        <button
          type="button"
          className="auditing-panel-button"
          data-evaluate-action="step-in"
          disabled={!dialog.canStepIn}
          onClick={() => void runEvaluate('step-in')}
        >
          {t`Step In`}
        </button>
        <button
          type="button"
          className="auditing-panel-button"
          data-evaluate-action="step-out"
          disabled={!dialog.canStepOut}
          onClick={() => void runEvaluate('step-out')}
        >
          {t`Step Out`}
        </button>
        <button
          type="button"
          className="auditing-panel-button"
          data-evaluate-action="restart"
          disabled={dialog.busy || !trace}
          onClick={() => void runEvaluate('restart')}
        >
          {t`Restart`}
        </button>
      </div>
    </dialog>
  )
}
