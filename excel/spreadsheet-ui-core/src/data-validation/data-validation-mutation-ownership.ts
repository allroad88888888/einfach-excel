import type { Getter } from '@einfach/core'
import type { CellRange } from '../shared'
import type { ValidationRuleEditorState } from './types'
import {
  dataValidationMutationReservationAtom,
  type DataValidationMutationReservation,
} from './data-validation-mutation-ledger'
import {
  dataValidationTargetAuthorityIsCurrent,
  type DataValidationTargetAuthority,
} from './data-validation-target-authority'
import { sameRange } from './data-validation-value'
import { validationRuleEditorStateAtom } from './validation-rule-editor-state'

interface MutationOwnershipInput {
  readonly get: Getter
  readonly reservation: DataValidationMutationReservation
  readonly sessionId: number
  readonly requestId: number
  readonly sheetId: string
  readonly range: Readonly<CellRange>
  readonly targetAuthority: DataValidationTargetAuthority
}

export interface DataValidationMutationOwnership {
  readonly readOwnedEditor: () => ValidationRuleEditorState | null
  readonly isCurrentTarget: () => boolean
}

export function createDataValidationMutationOwnership(
  input: MutationOwnershipInput,
): DataValidationMutationOwnership {
  const matchesOwnedEditor = (current: ValidationRuleEditorState): boolean =>
    current.status === 'editing' &&
    current.sessionId === input.sessionId &&
    current.requestId === input.requestId &&
    current.targetSheetId === input.sheetId &&
    current.range !== undefined &&
    sameRange(current.range, input.range)

  const readOwnedEditor = (): ValidationRuleEditorState | null => {
    if (input.get(dataValidationMutationReservationAtom) !== input.reservation) return null
    const current = input.get(validationRuleEditorStateAtom)
    if (!matchesOwnedEditor(current)) return null
    return input.get(dataValidationMutationReservationAtom) === input.reservation &&
      input.get(validationRuleEditorStateAtom) === current
      ? current
      : null
  }

  return {
    readOwnedEditor,
    isCurrentTarget: (): boolean => {
      try {
        const current = readOwnedEditor()
        return (
          current !== null &&
          dataValidationTargetAuthorityIsCurrent(input.get, input.targetAuthority) &&
          readOwnedEditor() === current
        )
      } catch {
        return false
      }
    },
  }
}
