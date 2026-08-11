/** @jsxImportSource solid-js */

import { useAtomValue } from '@einfach/solid'

import { SpreadsheetFeedbackSurface } from '../feedback/SpreadsheetFeedbackSurface'
import { useAtomFeedbackPresentation } from '../feedback/use-atom-feedback-presentation'
import {
  spreadsheetWorkbookLifecycleAtom,
  type SpreadsheetWorkbookLifecycle,
} from '../provider/atoms'
import { workbookLifecycleFeedback } from './workbook-lifecycle-feedback'

export interface SpreadsheetWorkbookRecoveryProps {
  class?: string
  'data-testid'?: string
  /**
   * An owner-supplied recovery action. The provider does not expose a generic
   * retry Atom because replacing a failed runtime is owned by the host.
   */
  onRetry?: (lifecycle: SpreadsheetWorkbookLifecycle) => void
  retryLabel?: string
}

/** Displays the existing Provider lifecycle without owning recovery state. */
export function SpreadsheetWorkbookRecovery(props: SpreadsheetWorkbookRecoveryProps) {
  const lifecycle = useAtomValue(spreadsheetWorkbookLifecycleAtom)
  const feedback = useAtomFeedbackPresentation({
    sourceAtom: spreadsheetWorkbookLifecycleAtom,
    map: workbookLifecycleFeedback,
  })

  const testId = () => props['data-testid'] ?? 'workbook-recovery'
  const canRetry = () => lifecycle().phase === 'failed' && props.onRetry !== undefined
  const retry = () => {
    const current = lifecycle()
    if (current.phase === 'failed') props.onRetry?.(current)
  }

  return (
    <div
      class={`spreadsheet-workbook-recovery${props.class ? ` ${props.class}` : ''}`}
      data-testid={testId()}
      data-lifecycle-phase={lifecycle().phase}
      data-session-id={lifecycle().sessionId}
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
