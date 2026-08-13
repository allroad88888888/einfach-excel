/** @jsxImportSource solid-js */

import { useAtomValue } from '@einfach/solid'
import { editingCommitFeedback, editingCommitLifecycleAtom } from '@einfach/spreadsheet-ui-core'
import type { EditingCommitLifecycleState } from '@einfach/spreadsheet-ui-core'

import { SpreadsheetFeedbackSurface } from './SpreadsheetFeedbackSurface'
import { useAtomFeedbackPresentation } from './use-atom-feedback-presentation'

export interface SpreadsheetEditingCommitFeedbackProps {
  class?: string
  'data-testid'?: string
  /**
   * Optional host retry. Re-running a commit needs the same backend port and
   * `refreshProjection` the host passed to `runEditingCommitAtom`, which this
   * component does not own — so, like `SpreadsheetWorkbookRecovery`, it renders
   * a retry button only when the host supplies the action.
   */
  onRetry?: (lifecycle: EditingCommitLifecycleState) => void
  retryLabel?: string
}

/**
 * Says out loud that an edit did not land. Without this, the three terminal
 * lifecycle states render as nothing at all: the cell editor stays open with
 * the draft intact (by design) and the user reads that as a dead Enter key.
 */
export function SpreadsheetEditingCommitFeedback(props: SpreadsheetEditingCommitFeedbackProps) {
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const feedback = useAtomFeedbackPresentation({
    sourceAtom: editingCommitLifecycleAtom,
    map: editingCommitFeedback,
  })

  const testId = () => props['data-testid'] ?? 'editing-commit-feedback'
  const canRetry = () => feedback() !== null && props.onRetry !== undefined
  const retry = () => props.onRetry?.(lifecycle())

  return (
    <div
      class={`spreadsheet-editing-commit-feedback${props.class ? ` ${props.class}` : ''}`}
      data-testid={testId()}
      data-commit-status={lifecycle().status}
    >
      <SpreadsheetFeedbackSurface
        feedback={feedback}
        onRetry={canRetry() ? retry : undefined}
        retryLabel={props.retryLabel}
        data-testid={`${testId()}-feedback`}
      />
    </div>
  )
}
