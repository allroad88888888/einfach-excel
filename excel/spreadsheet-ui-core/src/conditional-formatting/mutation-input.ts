import type { ConditionalFormatMutationInputSnapshot } from './mutation-types'
import { isObjectRecord, snapshotScope } from './snapshot-format'
import { freezeScope } from './value-domain'

export function snapshotMutationInput(
  value: unknown,
): ConditionalFormatMutationInputSnapshot | null {
  if (!isObjectRecord(value)) return null
  try {
    const action = value.action
    const sheetId = value.sheetId
    const scopeValue = value.scope
    const setRule = value.setRule
    const removeRule = value.removeRule
    const listRules = value.listRules
    const acceptAcknowledgedResult = value.acceptAcknowledgedResult
    if (action !== 'save' && action !== 'remove') return null
    if (sheetId !== undefined && typeof sheetId !== 'string') return null
    const scope = scopeValue === undefined ? undefined : snapshotScope(scopeValue)
    if (scope === null) return null
    if (setRule !== undefined && typeof setRule !== 'function') return null
    if (removeRule !== undefined && typeof removeRule !== 'function') return null
    if (listRules !== undefined && typeof listRules !== 'function') return null
    if (acceptAcknowledgedResult !== undefined && typeof acceptAcknowledgedResult !== 'function') return null
    return Object.freeze({
      action,
      sheetId,
      scope: scope === undefined ? undefined : freezeScope(scope),
      setRule: setRule as ConditionalFormatMutationInputSnapshot['setRule'],
      removeRule: removeRule as ConditionalFormatMutationInputSnapshot['removeRule'],
      listRules: listRules as ConditionalFormatMutationInputSnapshot['listRules'],
      acceptAcknowledgedResult:
        acceptAcknowledgedResult as ConditionalFormatMutationInputSnapshot['acceptAcknowledgedResult'],
    })
  } catch {
    return null
  }
}
