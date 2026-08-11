import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing'
import { validationRuleFromForm } from './data-validation-form'
import { evaluateValidationLocal } from './data-validation-local-evaluation'
import { validationRuleEditorAtom } from './validation-rule-editor-state'
import type { ValidationOutcome } from './types'

export const validationStatusAtom = atom<ValidationOutcome | null>((get) => {
  const editing = get(editingSessionAtom)
  const editor = get(validationRuleEditorAtom)
  if (editing.status !== 'drafting' || editor.status !== 'editing' || !editor.hasRuleDraft)
    return null
  return evaluateValidationLocal(validationRuleFromForm(editor.form), editing.draft)
})
validationStatusAtom.debugLabel = 'spreadsheet.validation.status'
