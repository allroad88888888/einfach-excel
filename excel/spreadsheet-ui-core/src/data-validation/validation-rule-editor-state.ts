import { atom, type Atom } from '@einfach/core'
import type {
  OpenValidationRuleEditorInput,
  ValidationRule,
  ValidationRuleEditorState,
  ValidationRuleFormState,
} from './types'
import {
  DEFAULT_VALIDATION_RULE_FORM_STATE,
  formStateFromInput,
  freezeForm,
  patchChangesValidationRule,
  snapshotFormPatch,
  validationRuleFromForm,
} from './data-validation-form'
import { freezeEditorFacade } from './data-validation-facade'
import { nextDataValidationSessionId } from './data-validation-identity'
import { snapshotOpenEditorInput } from './data-validation-input'
import { freezeRange, freezeRule } from './data-validation-value'

const DATA_VALIDATION_SESSION_IDENTITY_EXHAUSTED_ERROR =
  'Data validation editor session identity space is exhausted or corrupt'

const INITIAL_EDITOR_STATE: ValidationRuleEditorState = Object.freeze({
  status: 'closed',
  sessionId: 0,
  requestId: null,
  targetSheetId: null,
  hasRuleDraft: false,
  form: DEFAULT_VALIDATION_RULE_FORM_STATE,
  pending: false,
  error: null,
})

export const validationRuleEditorStateAtom = atom<ValidationRuleEditorState>(
  freezeEditorFacade(INITIAL_EDITOR_STATE),
)
validationRuleEditorStateAtom.debugLabel = 'spreadsheet.validation.ruleEditorState'

export const validationRuleEditorAtom: Atom<ValidationRuleEditorState> = atom((get) =>
  freezeEditorFacade(get(validationRuleEditorStateAtom)),
)
validationRuleEditorAtom.debugLabel = 'spreadsheet.validation.ruleEditor'

export const validationRuleFormAtom: Atom<Readonly<ValidationRuleFormState>> = atom(
  (get) => get(validationRuleEditorStateAtom).form,
)
validationRuleFormAtom.debugLabel = 'spreadsheet.validation.ruleForm'

export const validationRuleFormRuleAtom: Atom<ValidationRule> = atom((get) =>
  freezeRule(validationRuleFromForm(get(validationRuleFormAtom))),
)
validationRuleFormRuleAtom.debugLabel = 'spreadsheet.validation.ruleFormRule'

export function planClosedEditorState(
  previous: ValidationRuleEditorState,
): ValidationRuleEditorState | null {
  const sessionId = nextDataValidationSessionId(previous.sessionId)
  return sessionId === null
    ? null
    : { ...INITIAL_EDITOR_STATE, sessionId, form: DEFAULT_VALIDATION_RULE_FORM_STATE }
}

export function unavailableSessionEditorState(
  previous: ValidationRuleEditorState,
  pending = previous.pending,
): ValidationRuleEditorState {
  return { ...previous, pending, error: DATA_VALIDATION_SESSION_IDENTITY_EXHAUSTED_ERROR }
}

export const updateValidationRuleFormAtom = atom(
  null,
  (get, set, patch: Partial<ValidationRuleFormState>) => {
    const editor = get(validationRuleEditorStateAtom)
    if (editor.status !== 'editing' || editor.pending) return
    const patchSnapshot = snapshotFormPatch(patch)
    if (patchSnapshot === null || get(validationRuleEditorStateAtom) !== editor) return
    set(
      validationRuleEditorStateAtom,
      freezeEditorFacade({
        ...editor,
        hasRuleDraft: editor.hasRuleDraft || patchChangesValidationRule(editor.form, patchSnapshot),
        form: freezeForm({ ...editor.form, ...patchSnapshot }),
        error: null,
      }),
    )
  },
)
updateValidationRuleFormAtom.debugLabel = 'spreadsheet.validation.updateRuleForm'

export const openValidationRuleEditorAtom = atom(
  null,
  (get, set, input: OpenValidationRuleEditorInput) => {
    const previous = get(validationRuleEditorStateAtom)
    const sessionId = nextDataValidationSessionId(previous.sessionId)
    if (sessionId === null) {
      set(
        validationRuleEditorStateAtom,
        freezeEditorFacade(unavailableSessionEditorState(previous)),
      )
      return
    }
    const inputSnapshot = snapshotOpenEditorInput(input)
    if (inputSnapshot === null || get(validationRuleEditorStateAtom) !== previous) return
    set(
      validationRuleEditorStateAtom,
      freezeEditorFacade({
        status: 'editing',
        sessionId,
        requestId: null,
        targetSheetId: null,
        ...(inputSnapshot.range === undefined ? {} : { range: freezeRange(inputSnapshot.range) }),
        hasRuleDraft: inputSnapshot.draft !== undefined,
        form: freezeForm(formStateFromInput(inputSnapshot)),
        pending: false,
        error: null,
      }),
    )
  },
)
openValidationRuleEditorAtom.debugLabel = 'spreadsheet.validation.openRuleEditor'

export const closeValidationRuleEditorAtom = atom(null, (get, set) => {
  const previous = get(validationRuleEditorStateAtom)
  const next = planClosedEditorState(previous) ?? unavailableSessionEditorState(previous)
  set(validationRuleEditorStateAtom, freezeEditorFacade(next))
})
closeValidationRuleEditorAtom.debugLabel = 'spreadsheet.validation.closeRuleEditor'
