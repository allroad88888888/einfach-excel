import type { NativeDataValidationRule, NativeValidationErrorStyle } from '../native-rule'

/** 高级字段是表单草稿，已存事实只由 validation.read 载入。 */
export interface AdvancedValidationDraft {
  formula: string
  showInputMessage: boolean
  inputTitle: string
  inputMessage: string
  errorStyle: NativeValidationErrorStyle
  errorTitle: string
  errorMessage: string
}
export const EMPTY_ADVANCED_VALIDATION: AdvancedValidationDraft = {
  formula: '', showInputMessage: false, inputTitle: '', inputMessage: '',
  errorStyle: 'stop', errorTitle: '', errorMessage: '',
}

export function readAdvancedValidationDraft(
  rule: NativeDataValidationRule,
): AdvancedValidationDraft {
  return {
    ...EMPTY_ADVANCED_VALIDATION,
    formula: rule.kind === 'custom-formula' ? rule.formula : '',
    showInputMessage: rule.inputMessage !== undefined,
    inputTitle: rule.inputMessage?.title ?? '',
    inputMessage: rule.inputMessage?.message ?? '',
    errorStyle: rule.errorAlert?.style ?? 'stop',
    errorTitle: rule.errorAlert?.title ?? '',
    errorMessage: rule.errorAlert?.message ?? '',
  }
}

export function advancedValidationOptions(draft: AdvancedValidationDraft) {
  return {
    ...(draft.showInputMessage
      ? { inputMessage: { title: draft.inputTitle, message: draft.inputMessage } }
      : {}),
    ...(draft.errorStyle !== 'stop' || draft.errorTitle || draft.errorMessage
      ? {
          errorAlert: {
            style: draft.errorStyle,
            title: draft.errorTitle,
            message: draft.errorMessage,
          },
        }
      : {}),
  }
}
