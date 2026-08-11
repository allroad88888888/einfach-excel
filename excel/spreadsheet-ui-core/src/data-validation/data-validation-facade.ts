import type { DataValidationOperationAttempt, ValidationRuleEditorState } from './types'
import { freezeForm } from './data-validation-form'
import { freezeRange } from './data-validation-value'

export function freezeEditorFacade(state: ValidationRuleEditorState): ValidationRuleEditorState {
  return Object.freeze({
    ...state,
    ...(state.range === undefined ? {} : { range: freezeRange(state.range) }),
    form: freezeForm(state.form),
  })
}

function freezeAttemptFacade(
  attempt: DataValidationOperationAttempt,
): DataValidationOperationAttempt {
  return Object.freeze({ ...attempt, range: freezeRange(attempt.range) })
}

export function freezeLedgerFacade(
  ledger: readonly DataValidationOperationAttempt[],
): readonly DataValidationOperationAttempt[] {
  return Object.freeze(ledger.map(freezeAttemptFacade))
}
