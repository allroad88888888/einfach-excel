import type { OpenValidationRuleEditorInput, RunDataValidationMutationInput } from './types'
import {
  freezeRange,
  freezeRule,
  isObjectRecord,
  snapshotRange,
  snapshotRule,
} from './data-validation-value'

export interface DataValidationMutationInputSnapshot {
  readonly action: RunDataValidationMutationInput['action']
  readonly sheetId: string | undefined
  readonly setRule: RunDataValidationMutationInput['setRule']
  readonly clearRule: RunDataValidationMutationInput['clearRule']
  readonly acceptAcknowledgedResult: RunDataValidationMutationInput['acceptAcknowledgedResult']
}

export function snapshotOpenEditorInput(value: unknown): OpenValidationRuleEditorInput | null {
  if (!isObjectRecord(value)) return null
  try {
    const range = value.range === undefined ? undefined : snapshotRange(value.range)
    const draft = snapshotRule(value.draft)
    const { mode } = value
    if (range === null || draft === null) return null
    if (mode !== undefined && mode !== 'warn' && mode !== 'reject') return null
    return Object.freeze({
      ...(range === undefined ? {} : { range: freezeRange(range) }),
      ...(draft === undefined ? {} : { draft: freezeRule(draft) }),
      ...(mode === undefined ? {} : { mode }),
    })
  } catch {
    return null
  }
}

export function snapshotMutationInput(value: unknown): DataValidationMutationInputSnapshot | null {
  if (!isObjectRecord(value)) return null
  try {
    const { action, sheetId, setRule, clearRule, acceptAcknowledgedResult } = value
    if (action !== 'save' && action !== 'clear') return null
    if (sheetId !== undefined && typeof sheetId !== 'string') return null
    if (setRule !== undefined && typeof setRule !== 'function') return null
    if (clearRule !== undefined && typeof clearRule !== 'function') return null
    if (acceptAcknowledgedResult !== undefined && typeof acceptAcknowledgedResult !== 'function') {
      return null
    }
    return Object.freeze({
      action,
      sheetId,
      setRule: setRule as RunDataValidationMutationInput['setRule'],
      clearRule: clearRule as RunDataValidationMutationInput['clearRule'],
      acceptAcknowledgedResult:
        acceptAcknowledgedResult as RunDataValidationMutationInput['acceptAcknowledgedResult'],
    })
  } catch {
    return null
  }
}
