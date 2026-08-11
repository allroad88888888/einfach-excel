import type {
  OpenValidationRuleEditorInput,
  ValidationRule,
  ValidationRuleFormState,
} from './types'
import { isObjectRecord } from './data-validation-value'

export const DEFAULT_VALIDATION_RULE_FORM_STATE: Readonly<ValidationRuleFormState> = Object.freeze({
  kind: 'list',
  mode: 'warn',
  listValues: '',
  listDropdown: true,
  rangeMin: '',
  rangeMax: '',
  rangeIntegerOnly: false,
  regexPattern: '',
  regexFlags: '',
  formulaText: '',
})

const VALIDATION_RULE_FORM_FIELDS = [
  'kind',
  'listValues',
  'listDropdown',
  'rangeMin',
  'rangeMax',
  'rangeIntegerOnly',
  'regexPattern',
  'regexFlags',
  'formulaText',
] as const satisfies readonly (keyof ValidationRuleFormState)[]

export function freezeForm(
  form: Readonly<ValidationRuleFormState>,
): Readonly<ValidationRuleFormState> {
  return Object.freeze({ ...form })
}

export function formStateFromInput(input: OpenValidationRuleEditorInput): ValidationRuleFormState {
  const draft = input.draft
  return {
    kind: draft?.kind ?? 'list',
    mode: input.mode ?? 'warn',
    listValues: draft?.kind === 'list' ? draft.values.join(', ') : '',
    listDropdown: draft?.kind === 'list' ? draft.dropdown : true,
    rangeMin: draft?.kind === 'range' && draft.min !== undefined ? String(draft.min) : '',
    rangeMax: draft?.kind === 'range' && draft.max !== undefined ? String(draft.max) : '',
    rangeIntegerOnly: draft?.kind === 'range' ? draft.integerOnly === true : false,
    regexPattern: draft?.kind === 'regex' ? draft.pattern : '',
    regexFlags: draft?.kind === 'regex' ? (draft.flags ?? '') : '',
    formulaText: draft?.kind === 'formula' ? draft.formula : '',
  }
}

export function patchChangesValidationRule(
  form: Readonly<ValidationRuleFormState>,
  patch: Partial<ValidationRuleFormState>,
): boolean {
  return VALIDATION_RULE_FORM_FIELDS.some(
    (field) =>
      Object.prototype.hasOwnProperty.call(patch, field) && !Object.is(patch[field], form[field]),
  )
}

export function validationRuleFromForm(form: Readonly<ValidationRuleFormState>): ValidationRule {
  if (form.kind === 'list') {
    return {
      kind: 'list',
      values: form.listValues
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      dropdown: form.listDropdown,
    }
  }
  if (form.kind === 'range') {
    return {
      kind: 'range',
      min: form.rangeMin !== '' ? Number(form.rangeMin) : undefined,
      max: form.rangeMax !== '' ? Number(form.rangeMax) : undefined,
      ...(form.rangeIntegerOnly ? { integerOnly: true } : {}),
    }
  }
  if (form.kind === 'regex') {
    return {
      kind: 'regex',
      pattern: form.regexPattern,
      ...(form.regexFlags === '' ? {} : { flags: form.regexFlags }),
    }
  }
  return { kind: 'formula', formula: form.formulaText }
}

export function snapshotFormPatch(value: unknown): Partial<ValidationRuleFormState> | null {
  if (!isObjectRecord(value)) return null
  const patch: Partial<ValidationRuleFormState> = {}
  try {
    for (const field of [...VALIDATION_RULE_FORM_FIELDS, 'mode'] as const) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) continue
      const fieldValue = value[field]
      if (
        field === 'kind' &&
        fieldValue !== 'list' &&
        fieldValue !== 'range' &&
        fieldValue !== 'regex' &&
        fieldValue !== 'formula'
      ) {
        return null
      }
      if (field === 'mode' && fieldValue !== 'warn' && fieldValue !== 'reject') return null
      if (field === 'listDropdown' || field === 'rangeIntegerOnly') {
        if (typeof fieldValue !== 'boolean') return null
      } else if (field !== 'kind' && field !== 'mode' && typeof fieldValue !== 'string') {
        return null
      }
      Object.assign(patch, { [field]: fieldValue })
    }
    return Object.freeze(patch)
  } catch {
    return null
  }
}
